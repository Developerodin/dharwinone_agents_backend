// @vitest-environment node
// Port-fidelity tests for consent.readLedger (port of backend/studio/consent.py's
// read_ledger — the only piece of that module this app ports; see consent.ts).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as consent from "./consent";
import { consentPath } from "./paths";
import { resetForTests } from "./config";

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "studio-consent-"));
  process.env.STUDIO_BACKEND_DIR = tmpRoot;
  resetForTests();
});

afterEach(() => {
  delete process.env.STUDIO_BACKEND_DIR;
  resetForTests();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("readLedger", () => {
  it("returns [] when no ledger file exists", () => {
    expect(consent.readLedger("proj-1")).toEqual([]);
  });

  it("parses one JSON object per line, skipping blank lines", () => {
    const p = consentPath("proj-2");
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const entryA = {
      ts: 1,
      run_id: "r1",
      stage: "plan",
      kind: "anthropic",
      model: "m1",
      prompt_bytes: 10,
      prompt_sha256: "abc",
    };
    const entryB = {
      ts: 2,
      run_id: "r1",
      stage: "impl",
      kind: "openai",
      model: "m2",
      prompt_bytes: 20,
      prompt_sha256: "def",
    };
    fs.writeFileSync(p, `${JSON.stringify(entryA)}\n\n${JSON.stringify(entryB)}\n`, "utf-8");
    expect(consent.readLedger("proj-2")).toEqual([entryA, entryB]);
  });
});
