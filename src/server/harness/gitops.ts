/** Full port of backend/harness/gitops.py */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export class GitError extends Error {}

export function git(args: string[], cwd: string): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (r.status !== 0) {
    throw new GitError(`git ${args.join(" ")}: ${(r.stderr || r.stdout || "").trim()}`);
  }
  return (r.stdout || "").trim();
}

export function ensureIntegration(repo: string, branch: string): void {
  if (!git(["branch", "--list", branch], repo)) git(["branch", branch], repo);
}

export function createWorktree(
  repo: string,
  wtRoot: string,
  taskId: string,
  branch: string,
  branchName?: string,
): string {
  const wtPath = path.join(wtRoot, taskId);
  const bname = branchName ?? `harness/task/${taskId}`;
  git(["worktree", "add", "-B", bname, wtPath, branch], repo);
  return wtPath;
}

export function commitAll(wt: string, msg: string): void {
  git(["add", "-A"], wt);
  const r = spawnSync("git", ["commit", "-m", msg], { cwd: wt, encoding: "utf-8" });
  const out = (r.stdout || "") + (r.stderr || "");
  if (r.status !== 0 && !out.includes("nothing to commit")) {
    throw new GitError(`commit: ${out.trim()}`);
  }
}

export function changedPaths(wt: string, baseBranch: string): string[] {
  const out = git(["diff", "--name-only", baseBranch], wt);
  return out.split(/\r?\n/).filter((l) => l.trim());
}

export function diffText(wt: string, baseBranch: string): string {
  return git(["diff", baseBranch], wt);
}

export function integrationWorktree(repo: string, wtRoot: string, branch: string): string {
  const wtPath = path.join(wtRoot, "_integration");
  if (!fs.existsSync(wtPath)) git(["worktree", "add", wtPath, branch], repo);
  return wtPath;
}

export function mergeTask(intWt: string, taskId: string, branchName?: string): void {
  const bname = branchName ?? `harness/task/${taskId}`;
  git(["merge", "--no-ff", "-m", `harness: ship ${taskId}`, bname], intWt);
}

export function removeWorktree(
  repo: string,
  wtPath: string,
  taskId: string,
  keepBranch: boolean,
  branchName?: string,
): void {
  git(["worktree", "remove", "--force", wtPath], repo);
  if (!keepBranch) {
    const bname = branchName ?? `harness/task/${taskId}`;
    git(["branch", "-D", bname], repo);
  }
}

export function staleWorktrees(wtRoot: string): string[] {
  if (!fs.existsSync(wtRoot)) return [];
  return fs
    .readdirSync(wtRoot)
    .filter((d) => d !== "_integration")
    .map((d) => path.join(wtRoot, d));
}

export function recover(cfg: Record<string, unknown>, onlyTaskIds?: Set<string>): void {
  const wtRoot = String(cfg.worktree_root);
  const repo = String(cfg.repo_root);
  for (const wtPath of staleWorktrees(wtRoot)) {
    const name = path.basename(wtPath);
    if (onlyTaskIds && !onlyTaskIds.has(name)) continue;
    try {
      git(["worktree", "remove", "--force", wtPath], repo);
    } catch {
      fs.rmSync(wtPath, { recursive: true, force: true });
    }
  }
  try {
    git(["worktree", "prune"], repo);
  } catch {
    /* ignore */
  }
}
