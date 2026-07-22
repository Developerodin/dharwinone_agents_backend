/** Port of backend/studio/tests/fake_worker.py — scripted worker for vitest/E2E. */
import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, journalRead, JournalWriter, packet } from "./packets";

const FIXTURE = path.join(process.cwd(), "studio", "tests", "fixtures", "happy_path_journal.jsonl");
const POLL_MS = parseFloat(process.env.STUDIO_GATE_POLL ?? "250");

function loadFixture(): Record<string, unknown>[] {
  return fs
    .readFileSync(FIXTURE, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

function writePackets(runDir: string, taskId: string): void {
  const pdir = path.join(runDir, "packets", taskId);
  fs.mkdirSync(pdir, { recursive: true });
  atomicWriteJson(
    path.join(pdir, "plan.json"),
    packet("PLAN", taskId, { approach: "Demo approach for E2E.", files: ["src/demo.txt"] }),
  );
  atomicWriteJson(
    path.join(pdir, "explain.json"),
    packet("EXPLAIN", taskId, { summary: "Adds demo.txt with hello content.", files: ["src/demo.txt"] }),
  );
  atomicWriteJson(
    path.join(pdir, "simulate.json"),
    packet("SIMULATE", taskId, {
      blast_files: ["src/demo.txt"],
      blast_count: 1,
      size_band: "S",
      risk: "low",
    }),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitGate(runDir: string, gate: string): Promise<Record<string, unknown>> {
  const approval = path.join(runDir, "approvals", `${gate}.json`);
  while (!fs.existsSync(approval)) await sleep(POLL_MS);
  return JSON.parse(fs.readFileSync(approval, "utf8")) as Record<string, unknown>;
}

async function replayHappy(runDir: string, jw: JournalWriter, taskId: string): Promise<void> {
  fs.mkdirSync(path.join(runDir, "approvals"), { recursive: true });
  writePackets(runDir, taskId);
  const delay = parseFloat(process.env.STUDIO_FAKE_EVENT_DELAY ?? "0.05");
  for (const ev of loadFixture()) {
    const name = String(ev.event);
    const fields = Object.fromEntries(
      Object.entries(ev).filter(([k]) => !["ts", "seq", "run_id", "event"].includes(k)),
    );
    if (name === "gate_result") continue;
    if (name === "gate_open") {
      jw.emit(name, fields);
      const approval = await waitGate(runDir, String(fields.gate));
      jw.emit("gate_result", { gate: fields.gate, decision: approval.decision ?? "approve" });
      continue;
    }
    jw.emit(name, fields);
    await sleep(delay * 1000);
  }
}

export async function runFakeWorker(runDir: string, resume = false, signal?: AbortSignal): Promise<number> {
  const runData = JSON.parse(fs.readFileSync(path.join(runDir, "run.json"), "utf8")) as Record<string, unknown>;
  const runId = String(runData.run_id);
  const taskId = String((runData.task as Record<string, unknown>).id);
  const journalPath = path.join(runDir, "journal.jsonl");
  const jw = new JournalWriter(journalPath, runId);
  const mode = process.env.STUDIO_FAKE_WORKER_MODE ?? "happy";

  if (mode === "silent_death") {
    await sleep(500);
    return 0;
  }

  if (mode === "heartbeat_only") {
    jw.emit("run_start", { task: taskId });
    for (let i = 0; i < 3; i++) {
      signal?.throwIfAborted?.();
      jw.emit("heartbeat");
      await sleep(parseFloat(process.env.STUDIO_HEARTBEAT_INTERVAL ?? "0.2") * 1000);
    }
    await sleep(60_000);
    return 0;
  }

  if (mode === "plan_pause") {
    if (!resume) {
      jw.emit("run_start", { task: taskId });
      jw.emit("plan_start", { model: "fake" });
      jw.emit("plan_ready");
      jw.emit("explain_start");
      jw.emit("explain_ready");
      jw.emit("simulate_ready");
      jw.emit("gate_open", { gate: "plan" });
      runData.state = "paused";
      atomicWriteJson(path.join(runDir, "run.json"), runData);
      await sleep(30_000);
    } else {
      jw.emit("gate_result", { gate: "plan", decision: "timeout" });
      jw.emit("paused", { gate: "plan" });
    }
    return 0;
  }

  if (mode === "terminal_shipped") {
    jw.emit("run_start", { task: taskId });
    jw.emit("shipped", { task: taskId, evidence: {} });
    runData.state = "shipped";
    atomicWriteJson(path.join(runDir, "run.json"), runData);
    return 0;
  }

  if (mode === "happy") {
    await replayHappy(runDir, jw, taskId);
    runData.state = "shipped";
    atomicWriteJson(path.join(runDir, "run.json"), runData);
    return 0;
  }

  jw.emit("run_start", { task: taskId });
  jw.emit("shipped", { task: taskId, evidence: {} });
  return 0;
}

export function detectResumePoint(
  runDir: string,
  cfg: Record<string, unknown>,
  taskId: string,
): "plan" | "accept" | null {
  const journal = journalRead(String(cfg.journal_path));
  const planPath = path.join(String(cfg.packets_dir), taskId, "plan.json");
  const hasPlan = fs.existsSync(planPath);
  const hasAcceptReady = journal.some((e) => e.event === "accept_ready");
  const lastGate = (gate: string) => {
    for (let i = journal.length - 1; i >= 0; i--) {
      const e = journal[i]!;
      if (e.event === "gate_result" && e.gate === gate) return e;
    }
    return null;
  };
  if (hasAcceptReady && !lastGate("accept")) return "accept";
  if (hasPlan && !lastGate("plan")) return "plan";
  return null;
}
