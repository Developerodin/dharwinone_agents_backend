/** Port of backend/studio/events.py — SSE stream for run journals. */
import fs from "node:fs";
import path from "node:path";
import { journalRead, type JournalEvent } from "./packets";

const TERMINAL_STATES = new Set([
  "shipped",
  "blocked",
  "escalated",
  "rejected",
  "killed",
  "failed",
]);

function formatSse(event: JournalEvent): string {
  const data = JSON.stringify(event);
  const seq = event.seq ?? "";
  const ev = event.event ?? "message";
  return `id: ${seq}\nevent: ${ev}\ndata: ${data}\n\n`;
}

export async function* streamEvents(
  runDir: string,
  runData: Record<string, unknown>,
  lastEventId = -1,
): AsyncGenerator<string> {
  const journalPath = path.join(runDir, "journal.jsonl");
  let lastId = lastEventId;
  const sent = new Set<number>();

  const newEvents = (): JournalEvent[] => {
    const events = journalRead(journalPath);
    const out: JournalEvent[] = [];
    for (const e of events) {
      if (typeof e.seq !== "number") continue;
      if (e.seq > lastId && !sent.has(e.seq)) out.push(e);
    }
    return out;
  };

  for (const e of newEvents()) {
    sent.add(e.seq!);
    lastId = Math.max(lastId, e.seq!);
    yield formatSse(e);
  }

  const pollS = parseFloat(process.env.STUDIO_SSE_POLL_SEC ?? "0.25");
  while (true) {
    let found = false;
    for (const e of newEvents()) {
      found = true;
      sent.add(e.seq!);
      lastId = Math.max(lastId, e.seq!);
      yield formatSse(e);
    }

    const state = String(runData.state ?? "");
    const terminal = TERMINAL_STATES.has(state);

    if (terminal && !found) {
      for (const e of journalRead(journalPath)) {
        if (typeof e.seq === "number" && e.seq > lastId && !sent.has(e.seq)) {
          sent.add(e.seq);
          lastId = Math.max(lastId, e.seq);
          yield formatSse(e);
        }
      }
      yield "event: done\ndata: {}\n\n";
      break;
    }

    if (terminal) {
      let drained = true;
      for (const e of journalRead(journalPath)) {
        if (typeof e.seq === "number" && e.seq > lastId) {
          drained = false;
          break;
        }
      }
      if (drained) {
        yield "event: done\ndata: {}\n\n";
        break;
      }
    }

    await new Promise((r) => setTimeout(r, pollS * 1000));
    const runJson = path.join(runDir, "run.json");
    if (fs.existsSync(runJson)) {
      Object.assign(runData, JSON.parse(fs.readFileSync(runJson, "utf-8")));
    }
  }
}
