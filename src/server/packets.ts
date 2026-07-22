/** Port of backend/harness/packets.py — journal + atomic JSON writes. */
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

export type JournalEvent = Record<string, unknown> & {
  ts?: number;
  seq?: number;
  run_id?: string;
  event?: string;
};

export function atomicWriteJson(filePath: string, obj: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

export function journalRead(journalPath: string): JournalEvent[] {
  if (!fs.existsSync(journalPath)) return [];
  const out: JournalEvent[] = [];
  for (const line of fs.readFileSync(journalPath, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const rec = JSON.parse(trimmed) as JournalEvent;
      rec.seq = out.length;
      out.push(rec);
    } catch {
      /* torn tail — ignore */
    }
  }
  return out;
}

export class JournalWriter {
  private seq = 0;

  constructor(
    private readonly journalPath: string,
    private readonly runId: string,
  ) {
    for (const e of journalRead(this.journalPath)) {
      if (typeof e.seq === "number") this.seq = Math.max(this.seq, e.seq + 1);
    }
    fs.mkdirSync(path.dirname(this.journalPath), { recursive: true });
  }

  emit(event: string, fields: Record<string, unknown> = {}): JournalEvent {
    const line: JournalEvent = {
      ts: Date.now() / 1000,
      seq: this.seq,
      run_id: this.runId,
      event,
      ...fields,
    };
    fs.appendFileSync(this.journalPath, `${JSON.stringify(line)}\n`, "utf-8");
    this.seq += 1;
    return line;
  }
}

export function packet(kind: string, taskId: string, fields: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind,
    task: taskId,
    id: randomBytes(4).toString("hex"),
    ts: Date.now() / 1000,
    ...fields,
  };
}
