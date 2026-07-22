// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recover } from "./gitops";

let tmp: string;
let repo: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gitops-recover-"));
  repo = path.join(tmp, "repo");
  fs.mkdirSync(repo, { recursive: true });
  spawnSync("git", ["init", "-b", "main"], { cwd: repo, encoding: "utf-8" });
  spawnSync("git", ["config", "user.email", "t@t.t"], { cwd: repo });
  spawnSync("git", ["config", "user.name", "t"], { cwd: repo });
  fs.writeFileSync(path.join(repo, "README.md"), "x", "utf8");
  spawnSync("git", ["add", "."], { cwd: repo });
  spawnSync("git", ["commit", "-m", "init"], { cwd: repo });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("harness.recover", () => {
  it("removes stale worktree dirs idempotently", () => {
    const wtRoot = path.join(tmp, "wt");
    fs.mkdirSync(path.join(wtRoot, "task-a"), { recursive: true });
    fs.mkdirSync(path.join(wtRoot, "_integration"), { recursive: true });
    const cfg = { repo_root: repo, worktree_root: wtRoot };
    recover(cfg);
    recover(cfg, new Set(["task-a"]));
    expect(fs.existsSync(path.join(wtRoot, "task-a"))).toBe(false);
    expect(fs.existsSync(path.join(wtRoot, "_integration"))).toBe(true);
  });
});
