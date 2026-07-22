// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { atomicWriteJson, journalRead, JournalWriter } from "./packets";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "packets-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("journalRead", () => {
  it("returns [] for missing file", () => {
    expect(journalRead(path.join(tmp, "missing.jsonl"))).toEqual([]);
  });

  it("renumbers seq on read", () => {
    const p = path.join(tmp, "journal.jsonl");
    fs.writeFileSync(p, '{"event":"a"}\n{"event":"b"}\n', "utf-8");
    const events = journalRead(p);
    expect(events).toHaveLength(2);
    expect(events[0]!.seq).toBe(0);
    expect(events[1]!.seq).toBe(1);
  });
});

describe("JournalWriter", () => {
  it("appends monotonic events", () => {
    const p = path.join(tmp, "journal.jsonl");
    const jw = new JournalWriter(p, "run-1");
    jw.emit("run_start", { task: "t1" });
    jw.emit("heartbeat");
    const events = journalRead(p);
    expect(events).toHaveLength(2);
    expect(events[0]!.event).toBe("run_start");
    expect(events[1]!.event).toBe("heartbeat");
    expect(events[1]!.run_id).toBe("run-1");
  });
});

describe("atomicWriteJson", () => {
  it("writes readable json", () => {
    const p = path.join(tmp, "nested", "obj.json");
    atomicWriteJson(p, { ok: true });
    expect(JSON.parse(fs.readFileSync(p, "utf-8"))).toEqual({ ok: true });
  });
});
