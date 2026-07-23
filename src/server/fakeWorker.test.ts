// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { journalRead } from "./packets";
import { backendPath } from "./paths";
import { runFakeWorker } from "./fakeWorker";
import { resetWorkerRegistryForTests } from "./workerRegistry";

let runDir: string;

beforeEach(() => {
  runDir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-worker-"));
  process.env.STUDIO_FAKE_WORKER = "1";
  process.env.STUDIO_FAKE_EVENT_DELAY = "0";
  fs.writeFileSync(
    path.join(runDir, "run.json"),
    JSON.stringify({
      run_id: "r-demo-1",
      project_id: "p1",
      task: { id: "demo-1" },
      state: "running",
    }),
    "utf8",
  );
  fs.mkdirSync(path.join(runDir, "approvals"), { recursive: true });
});

afterEach(() => {
  delete process.env.STUDIO_FAKE_EVENT_DELAY;
  resetWorkerRegistryForTests();
  fs.rmSync(runDir, { recursive: true, force: true });
});

describe("fakeWorker happy path", () => {
  it("emits journal events matching golden fixture event names", async () => {
    for (const gate of ["plan", "accept"]) {
      fs.writeFileSync(
        path.join(runDir, "approvals", `${gate}.json`),
        JSON.stringify({ decision: "approve", payload: {}, ts: Date.now() / 1000 }),
        "utf8",
      );
    }
    await runFakeWorker(runDir, false);
    const events = journalRead(path.join(runDir, "journal.jsonl")).map((e) => e.event);
    const golden = fs
      .readFileSync(backendPath("assets/fixtures/happy_path_journal.jsonl"), "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => (JSON.parse(l) as { event: string }).event);
    for (const name of golden) {
      if (name === "gate_result") continue;
      expect(events).toContain(name);
    }
    expect(events.at(-1)).toBe("shipped");
  });
});
