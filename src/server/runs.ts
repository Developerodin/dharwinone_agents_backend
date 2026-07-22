/** Port of backend/studio/runs.py */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { runDir as runDirPath, runsDir, heartbeatStaleS, monitorIntervalS, dataDir } from "./config";
import { recoverHarness } from "./harnessBridge";
import * as legacyProjects from "./legacyProjects";
import { atomicWriteJson, journalRead, JournalWriter } from "./packets";
import * as preview from "./preview";
import { makeVariants, writeDraft, writeVariants } from "./runDraft";
import { startWorkerBackground } from "./worker";
import { abortWorker, isWorkerAlive } from "./workerRegistry";

export type RunRecord = Record<string, unknown> & {
  run_id: string;
  project_id: string;
  task: Record<string, unknown> & { id: string };
  state: string;
  pid: number | null;
  created_ts: number;
  heartbeat_ts: number;
  lane: string;
  fork_of?: string | null;
};

const JOURNAL_TERMINAL = new Set([
  "shipped",
  "blocked",
  "escalated",
  "rejected_by_user",
  "killed",
  "failed",
  "paused",
]);

const EVENT_TO_STATE: Record<string, string> = {
  shipped: "shipped",
  blocked: "blocked",
  escalated: "escalated",
  rejected_by_user: "rejected",
  killed: "killed",
  failed: "failed",
  paused: "paused",
};

const ACTIVE_STATES = new Set(["queued", "running", "editing"]);

function runJsonPath(runDir: string): string {
  return path.join(runDir, "run.json");
}

function slug(s: string): string {
  const cleaned = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");
  return cleaned || "run";
}

function allRunDirs(): string[] {
  const dataRuns = path.join(dataDir(), "runs");
  if (!fs.existsSync(dataRuns)) return [];
  const out: string[] = [];
  for (const projectId of fs.readdirSync(dataRuns)) {
    const projRuns = path.join(dataRuns, projectId);
    if (!fs.statSync(projRuns).isDirectory()) continue;
    for (const runId of fs.readdirSync(projRuns)) {
      out.push(path.join(projRuns, runId));
    }
  }
  return out;
}

export function loadRun(runId: string): RunRecord | null {
  for (const d of allRunDirs()) {
    if (path.basename(d) === runId) {
      return JSON.parse(fs.readFileSync(runJsonPath(d), "utf-8")) as RunRecord;
    }
  }
  return null;
}

export function findRunDir(runId: string): string | null {
  for (const d of allRunDirs()) {
    if (path.basename(d) === runId) return d;
  }
  return null;
}

export function listRuns(projectId: string): RunRecord[] {
  const root = runsDir(projectId);
  if (!fs.existsSync(root)) return [];
  const out: RunRecord[] = [];
  for (const name of fs.readdirSync(root)) {
    const p = path.join(root, name, "run.json");
    if (fs.existsSync(p)) out.push(JSON.parse(fs.readFileSync(p, "utf-8")) as RunRecord);
  }
  return out.sort((a, b) => (b.created_ts ?? 0) - (a.created_ts ?? 0));
}

function pidAlive(pid: number | null | undefined): boolean {
  if (!pid) return false;
  const r = spawnSync("tasklist", ["/FI", `PID eq ${pid}`], { encoding: "utf-8" });
  return (r.stdout ?? "").includes(String(pid));
}

function activeRun(projectId: string): RunRecord | null {
  for (const run of listRuns(projectId)) {
    if (ACTIVE_STATES.has(run.state)) return run;
    if (run.state === "paused" && run.pid && pidAlive(run.pid)) return run;
  }
  return null;
}

export function syncStateFromJournal(runData: RunRecord, journalPath: string): RunRecord {
  const events = journalRead(journalPath);
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]!.event;
    if (ev && EVENT_TO_STATE[ev]) {
      runData.state = EVENT_TO_STATE[ev]!;
      return runData;
    }
  }
  return runData;
}

function spawnWorker(runDir: string, resume = false): number {
  return startWorkerBackground(runDir, resume);
}

export type RunStartBody = {
  prompt: string;
  lane?: string;
  title?: string | null;
  allow_paths?: string[] | null;
  accept_template?: string | null;
  accept_args?: string[] | null;
  force?: boolean;
  fork_of?: string | null;
};

export function start(
  project: legacyProjects.LegacyProject,
  body: RunStartBody,
): [RunRecord | null, number] {
  const active = activeRun(project.id);
  if (active) {
    if (!body.force) return [null, 423];
    kill(active);
  }

  const runId = `${slug(body.title ?? body.prompt.slice(0, 30))}-${randomBytes(3).toString("hex")}`;
  const lane = body.lane ?? "feature";
  const category = lane === "fix" || lane === "build" ? lane : "feature";
  const defaultPaths = lane === "build" ? [""] : ["src/"];
  const task = {
    id: runId,
    source: "chat",
    category,
    title: body.title ?? body.prompt.slice(0, 80),
    prompt: body.prompt,
    allow_paths: body.allow_paths ?? defaultPaths,
    accept_template: body.accept_template ?? "default",
    accept_args: body.accept_args ?? [],
    requires: [],
  };

  const dir = runDirPath(project.id, runId);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "packets"), { recursive: true });
  const now = Date.now() / 1000;
  const runData: RunRecord = {
    run_id: runId,
    project_id: project.id,
    task,
    state: lane === "build" ? "editing" : "queued",
    pid: null,
    created_ts: now,
    heartbeat_ts: now,
    lane,
    fork_of: body.fork_of ?? null,
  };
  atomicWriteJson(runJsonPath(dir), runData);

  if (lane === "build") {
    try {
      const [tpl, variants] = makeVariants(body.prompt);
      writeVariants(dir, variants);
      writeDraft(dir, variants[0]!.html);
      const cfg = legacyProjects.deriveHarnessCfg(project, runId);
      const jw = new JournalWriter(String(cfg.journal_path), runId);
      jw.emit("draft_ready", {
        template: tpl,
        variants: variants.map((v) => ({ id: v.id, label: v.label })),
      });
    } catch {
      /* non-fatal */
    }
    return [runData, 201];
  }

  const pid = spawnWorker(dir);
  runData.pid = pid;
  runData.state = "running";
  atomicWriteJson(runJsonPath(dir), runData);
  return [runData, 201];
}

export function kill(runData: RunRecord): RunRecord {
  abortWorker(runData.run_id);
  const dir = findRunDir(runData.run_id);
  const project = legacyProjects.get(runData.project_id);
  if (project && dir) {
    const cfg = legacyProjects.deriveHarnessCfg(project, runData.run_id);
    new JournalWriter(String(cfg.journal_path), runData.run_id).emit("killed");
    recoverHarness(project, runData.run_id, runData.task.id);
    preview.stop(runData.run_id);
    runData.state = "killed";
    runData.pid = null;
    atomicWriteJson(runJsonPath(dir), runData);
  }
  return runData;
}

export function resume(runData: RunRecord): RunRecord {
  if (runData.state !== "paused") throw new Error("run is not paused");
  const dir = findRunDir(runData.run_id);
  if (!dir) throw new Error("run directory missing");
  const pid = spawnWorker(dir, true);
  runData.pid = pid;
  runData.state = "running";
  atomicWriteJson(runJsonPath(dir), runData);
  return runData;
}

export function ship(runData: RunRecord): RunRecord {
  if (runData.state !== "editing") throw new Error("run is not in editing state");
  const dir = findRunDir(runData.run_id);
  if (!dir) throw new Error("run directory missing");
  const working = path.join(dir, "working.html");
  if (!fs.existsSync(working)) throw new Error("working draft not found");
  const project = legacyProjects.get(runData.project_id);
  if (!project) throw new Error("project not found");
  const cfg = legacyProjects.deriveHarnessCfg(project, runData.run_id);
  new JournalWriter(String(cfg.journal_path), runData.run_id).emit("edit_session_end");
  runData.task.edit_session = true;
  runData.task.working_file = "working.html";
  atomicWriteJson(runJsonPath(dir), runData);
  const pid = spawnWorker(dir);
  runData.pid = pid;
  runData.state = "running";
  runData.heartbeat_ts = Date.now() / 1000;
  atomicWriteJson(runJsonPath(dir), runData);
  return runData;
}

export function monitorOnce(): void {
  for (const dir of allRunDirs()) {
    const jsonPath = runJsonPath(dir);
    if (!fs.existsSync(jsonPath)) continue;
    const runData = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as RunRecord;
    const journalPath = path.join(dir, "journal.jsonl");

    if (runData.state !== "running" && runData.state !== "paused") {
      syncStateFromJournal(runData, journalPath);
      atomicWriteJson(jsonPath, runData);
      if (Object.values(EVENT_TO_STATE).includes(runData.state)) preview.stop(runData.run_id);
      continue;
    }

    const events = journalRead(journalPath);
    const pid = runData.pid;
    if (runData.state === "running") {
      syncStateFromJournal(runData, journalPath);
      if (runData.state !== "running" && runData.state !== "paused") {
        runData.pid = null;
        preview.stop(runData.run_id);
        atomicWriteJson(jsonPath, runData);
        continue;
      }
      const lastTs = events.length ? Number(events[events.length - 1]!.ts ?? 0) : runData.created_ts;
      const stale = Date.now() / 1000 - lastTs > heartbeatStaleS();
      const workerDead = pid ? !pidAlive(pid) && !isWorkerAlive(runData.run_id) : !isWorkerAlive(runData.run_id);
      if (stale && workerDead) {
        syncStateFromJournal(runData, journalPath);
        const hasTerminal = events.some((e) => JOURNAL_TERMINAL.has(String(e.event)));
        if ((runData.state === "running" || runData.state === "paused") && !hasTerminal) {
          new JournalWriter(journalPath, runData.run_id).emit("failed", { reason: "worker died" });
          runData.state = "failed";
          runData.pid = null;
          preview.stop(runData.run_id);
        }
      }
    }
    syncStateFromJournal(runData, journalPath);
    if (Object.values(EVENT_TO_STATE).includes(runData.state)) {
      runData.pid = null;
      preview.stop(runData.run_id);
    }
    atomicWriteJson(jsonPath, runData);
  }
}

let monitorTimer: ReturnType<typeof setInterval> | null = null;

export function startMonitor(): void {
  if (monitorTimer) return;
  monitorTimer = setInterval(() => {
    try {
      monitorOnce();
    } catch {
      /* ignore tick errors */
    }
  }, monitorIntervalS() * 1000);
  monitorTimer.unref?.();
}

export function stopMonitor(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
}

export function resetMonitorForTests(): void {
  stopMonitor();
}
