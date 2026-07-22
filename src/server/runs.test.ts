// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { abortWorker, resetWorkerRegistryForTests } from "./workerRegistry";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetForTests as resetConfig } from "./config";
import * as legacyProjects from "./legacyProjects";
import * as runs from "./runs";

let dataDir: string;
let repoRoot: string;

function initRepo(): void {
  repoRoot = path.join(dataDir, "repo");
  fs.mkdirSync(repoRoot, { recursive: true });
  spawnSync("git", ["init", "-b", "main"], { cwd: repoRoot, encoding: "utf-8" });
  spawnSync("git", ["config", "user.email", "t@t.t"], { cwd: repoRoot });
  spawnSync("git", ["config", "user.name", "t"], { cwd: repoRoot });
  fs.writeFileSync(path.join(repoRoot, "README.md"), "hi", "utf-8");
  spawnSync("git", ["add", "."], { cwd: repoRoot, encoding: "utf-8" });
  spawnSync("git", ["commit", "-m", "init"], { cwd: repoRoot, encoding: "utf-8" });
}

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "runs-test-"));
  process.env.STUDIO_DATA = dataDir;
  process.env.STUDIO_FAKE_WORKER = "1";
  process.env.STUDIO_MONITOR_INTERVAL = "0.5";
  process.env.STUDIO_HEARTBEAT_STALE_SEC = "1";
  resetConfig();
  runs.resetMonitorForTests();
  initRepo();
});

afterEach(() => {
  delete process.env.STUDIO_DATA;
  delete process.env.STUDIO_FAKE_WORKER;
  delete process.env.STUDIO_MONITOR_INTERVAL;
  delete process.env.STUDIO_HEARTBEAT_STALE_SEC;
  delete process.env.STUDIO_FAKE_WORKER_MODE;
  resetConfig();
  runs.resetMonitorForTests();
  resetWorkerRegistryForTests();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("runs.start", () => {
  it("returns 201 with pid for feature lane", () => {
    const project = legacyProjects.create({ name: "Runs", repo_root: repoRoot });
    const [runData, code] = runs.start(project, { prompt: "do thing", lane: "feature" });
    expect(code).toBe(201);
    expect(runData!.pid).toBeTruthy();
    if (runData?.run_id) abortWorker(runData.run_id);
  });

  it("returns 423 for concurrent start", () => {
    process.env.STUDIO_FAKE_WORKER_MODE = "heartbeat_only";
    const project = legacyProjects.create({ name: "Runs2", repo_root: repoRoot });
    const [first] = runs.start(project, { prompt: "a" });
    const [, code] = runs.start(project, { prompt: "b" });
    expect(code).toBe(423);
    if (first?.run_id) abortWorker(first.run_id);
  });

  it("build lane sets editing state and build category", () => {
    const project = legacyProjects.create({ name: "Build", repo_root: repoRoot });
    const [runData, code] = runs.start(project, {
      prompt: "create a website for sports shoes",
      lane: "build",
    });
    expect(code).toBe(201);
    expect(runData!.lane).toBe("build");
    expect(runData!.state).toBe("editing");
    expect(runData!.task.category).toBe("build");
    expect(runData!.task.allow_paths).toEqual([""]);
  });
});

describe("runs.kill", () => {
  it("sets killed state", () => {
    process.env.STUDIO_FAKE_WORKER_MODE = "heartbeat_only";
    const project = legacyProjects.create({ name: "Kill", repo_root: repoRoot });
    const [runData] = runs.start(project, { prompt: "killme" });
    const updated = runs.kill(runData!);
    expect(updated.state).toBe("killed");
  });
});

describe("runs.listRuns", () => {
  it("lists runs newest first", () => {
    const project = legacyProjects.create({ name: "List", repo_root: repoRoot });
    runs.start(project, { prompt: "one", lane: "build" });
    const listed = runs.listRuns(project.id);
    expect(listed.length).toBeGreaterThan(0);
  });
});
