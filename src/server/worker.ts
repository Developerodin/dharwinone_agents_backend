/** Port of backend/studio/worker.py — in-process TS worker for one run. */
import fs from "node:fs";
import path from "node:path";
import { heartbeatIntervalS } from "./config";
import { makePolicy } from "./consent";
import { runTask } from "./driver";
import { makeCloudImplementer } from "./harness/cloudImplementer";
import {
  implementerMode,
  mergeProjectProviders,
  stageModel,
} from "./harness/providerConfig";
import { defaultImplementer, type ImplementerFn } from "./harness/supervisor";
import { get, type ProviderConfig } from "./providers";
import * as legacyProjects from "./legacyProjects";
import { atomicWriteJson, JournalWriter } from "./packets";
import { detectResumePoint, runFakeWorker } from "./fakeWorker";
import { registerWorker } from "./workerRegistry";

function loadRun(runDir: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(runDir, "run.json"), "utf8")) as Record<string, unknown>;
}

function saveRun(runDir: string, runData: Record<string, unknown>): void {
  atomicWriteJson(path.join(runDir, "run.json"), runData);
}

async function heartbeatLoop(
  jw: JournalWriter,
  runDir: string,
  runData: Record<string, unknown>,
  signal: AbortSignal,
): Promise<void> {
  const intervalMs = heartbeatIntervalS() * 1000;
  while (!signal.aborted) {
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, intervalMs);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new Error("aborted"));
          },
          { once: true },
        );
      });
    } catch {
      break;
    }
    jw.emit("heartbeat");
    runData.heartbeat_ts = Date.now() / 1000;
    saveRun(runDir, runData);
  }
}

export async function runWorker(runDir: string, resume = false, signal?: AbortSignal): Promise<number> {
  const fakeMode = process.env.STUDIO_FAKE_WORKER;
  if (fakeMode === "1" || fakeMode === "true") {
    return runFakeWorker(runDir, resume, signal);
  }

  const absRunDir = path.resolve(runDir);
  const runData = loadRun(absRunDir);
  const runId = String(runData.run_id);
  const project = legacyProjects.get(String(runData.project_id));
  if (!project) {
    console.error(`unknown project: ${runData.project_id}`);
    return 1;
  }

  const cfg = legacyProjects.deriveHarnessCfg(project, runId);
  if (runData.worktree_root) cfg.worktree_root = runData.worktree_root;
  const task = runData.task as Record<string, unknown>;
  const jw = new JournalWriter(String(cfg.journal_path), runId);
  const abort = signal ?? new AbortController().signal;
  const hb = heartbeatLoop(jw, absRunDir, runData, abort);

  const resumeFrom = resume ? detectResumePoint(absRunDir, cfg, String(task.id)) : null;
  const policy = makePolicy(project, runId);
  const mergedProviders = mergeProjectProviders(
    (cfg.providers as Record<string, { kind?: string; model?: string; baseUrl?: string }>) ?? {},
  );
  const providerCfg: ProviderConfig = {
    ollamaUrl: String(cfg.ollama_url),
    providers: mergedProviders,
  };
  const implementer: ImplementerFn =
    implementerMode() === "cloud"
      ? makeCloudImplementer(
          () => get(providerCfg, "implementer_llm", policy),
          () =>
            stageModel(
              mergedProviders,
              "implementer_llm",
              (cfg.models as Record<string, string>).feature ?? "gpt-4o",
            ),
        )
      : defaultImplementer;
  const gateTimeout = parseFloat(process.env.STUDIO_GATE_TIMEOUT ?? "3600");

  try {
    await runTask(project, runId, task, cfg, implementer, gateTimeout, resumeFrom, policy, abort);
  } finally {
    await hb.catch(() => {});
  }
  return 0;
}

export function startWorkerBackground(runDir: string, resume = false): number {
  const runData = loadRun(runDir);
  const runId = String(runData.run_id);
  const abort = new AbortController();
  const done = runWorker(runDir, resume, abort.signal)
    .catch((err) => {
      if (String(err).includes("aborted")) return 3;
      const project = legacyProjects.get(String(runData.project_id));
      if (project) {
        const cfg = legacyProjects.deriveHarnessCfg(project, runId);
        new JournalWriter(String(cfg.journal_path), runId).emit("failed", {
          reason: String(err instanceof Error ? err.message : err),
        });
      }
      return 1;
    })
    .then(() => undefined);
  registerWorker(runId, abort, done);
  return process.pid;
}
