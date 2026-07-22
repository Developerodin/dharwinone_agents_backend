/** Port of backend/studio/gates.py — wait() for driver polling. */
import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, journalRead, type JournalEvent, type JournalWriter } from "./packets";

function approvalPath(runDir: string, gate: string): string {
  return path.join(runDir, "approvals", `${gate}.json`);
}

export function writeApproval(
  runDir: string,
  gate: string,
  decision: string,
  payload: Record<string, unknown> | null = null,
): void {
  fs.mkdirSync(path.join(runDir, "approvals"), { recursive: true });
  atomicWriteJson(approvalPath(runDir, gate), {
    decision,
    payload: payload ?? {},
    ts: Date.now() / 1000,
  });
}

export function isGateOpen(journalPath: string, gate: string): boolean {
  const journal = journalRead(journalPath);
  let lastOpen: JournalEvent | null = null;
  let lastResult: JournalEvent | null = null;
  for (const e of journal) {
    if (e.event === "gate_open" && e.gate === gate) lastOpen = e;
    if (e.event === "gate_result" && e.gate === gate) lastResult = e;
  }
  if (!lastOpen) return false;
  if (!lastResult) return true;
  return (lastOpen.seq ?? 0) > (lastResult.seq ?? 0);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("aborted"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    });
  });
}

export async function waitGate(
  runDir: string,
  gate: string,
  timeoutS: number,
  jw: JournalWriter,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  jw.emit("gate_open", { gate });
  const deadline = Date.now() / 1000 + timeoutS;
  const path = approvalPath(runDir, gate);
  while (Date.now() / 1000 < deadline) {
    signal?.throwIfAborted?.();
    if (fs.existsSync(path)) {
      const data = JSON.parse(fs.readFileSync(path, "utf8")) as Record<string, unknown>;
      jw.emit("gate_result", { gate, decision: data.decision ?? "" });
      return data;
    }
    try {
      await sleep(500, signal);
    } catch {
      jw.emit("gate_timeout", { gate });
      return { decision: "timeout" };
    }
  }
  jw.emit("gate_timeout", { gate });
  return { decision: "timeout" };
}
