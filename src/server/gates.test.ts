// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isGateOpen, writeApproval } from "./gates";
import { JournalWriter } from "./packets";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gates-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("isGateOpen", () => {
  it("false when no gate_open", () => {
    expect(isGateOpen(path.join(tmp, "journal.jsonl"), "plan")).toBe(false);
  });

  it("true after gate_open without result", () => {
    const journal = path.join(tmp, "journal.jsonl");
    const jw = new JournalWriter(journal, "r1");
    jw.emit("gate_open", { gate: "plan" });
    expect(isGateOpen(journal, "plan")).toBe(true);
  });

  it("false after gate_result", () => {
    const journal = path.join(tmp, "journal.jsonl");
    const jw = new JournalWriter(journal, "r1");
    jw.emit("gate_open", { gate: "plan" });
    jw.emit("gate_result", { gate: "plan", decision: "approve" });
    expect(isGateOpen(journal, "plan")).toBe(false);
  });
});

describe("writeApproval", () => {
  it("creates approval file", () => {
    writeApproval(tmp, "plan", "approve", { approach: "x" });
    const p = path.join(tmp, "approvals", "plan.json");
    expect(fs.existsSync(p)).toBe(true);
    expect(JSON.parse(fs.readFileSync(p, "utf-8")).decision).toBe("approve");
  });
});
