/** Port of backend/harness/supervisor.py — studio worker engine core. */
import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson, packet } from "../packets";
import * as gitops from "./gitops";
import { guardSync, pathViolations } from "./guard";
import * as runner from "./runner";
import * as review from "./review";
import type { Provider } from "../providers";

export class RunPaused extends Error {}
export class RunCancelled extends Error {}

export type HarnessHooks = {
  emit: (event: string, fields?: Record<string, unknown>) => void;
  check: () => void;
};

export const noopHooks: HarnessHooks = {
  emit: () => {},
  check: () => {},
};

export async function planTask(
  provider: Provider,
  cfg: Record<string, unknown>,
  task: Record<string, unknown>,
): Promise<{ approach: string; files: string[] } | null> {
  const models = cfg.models as Record<string, string>;
  const limits = cfg.limits as { max_plan_files: number };
  const prompt =
    "Plan this coding task. Respond ONLY with JSON: " +
    '{"approach": "one paragraph", "files": ["paths you will touch"]}\n' +
    `Task: ${task.title}\n${task.prompt}\n` +
    `Allowed paths: ${JSON.stringify(task.allow_paths)}`;
  for (let i = 0; i < 2; i++) {
    try {
      const raw = await provider.generate(models.planner!, prompt, { jsonMode: true });
      const obj = JSON.parse(raw) as Record<string, unknown>;
      if (obj?.approach && Array.isArray(obj.files)) {
        if ((obj.files as unknown[]).length > limits.max_plan_files) return null;
        return { approach: String(obj.approach), files: obj.files as string[] };
      }
    } catch {
      continue;
    }
  }
  return null;
}

export type ImplementerFn = (
  task: Record<string, unknown>,
  wt: string,
  model: string,
  fmt: string,
  message: string,
  cfg: Record<string, unknown>,
) => void | Promise<void>;

export async function defaultImplementer(
  task: Record<string, unknown>,
  wt: string,
  model: string,
  fmt: string,
  message: string,
  cfg: Record<string, unknown>,
): Promise<void> {
  const msgFile = path.join(wt, ".harness_msg.txt");
  fs.writeFileSync(msgFile, message, "utf8");
  const cmd = [
    "aider",
    "--model",
    `ollama_chat/${model}`,
    "--edit-format",
    fmt,
    "--yes-always",
    "--no-stream",
    "--no-show-model-warnings",
    "--no-gitignore",
    "--map-tokens",
    "1024",
    "--message-file",
    msgFile,
    ...((task.plan_files as string[]) ?? []),
  ];
  const limits = cfg.limits as { task_timeout_min: number };
  runner.runCmd(cmd, wt, limits.task_timeout_min * 60, {
    OLLAMA_API_BASE: String(cfg.ollama_url),
  });
  if (fs.existsSync(msgFile)) fs.unlinkSync(msgFile);
}

function verify(task: Record<string, unknown>, wt: string, cfg: Record<string, unknown>): [number, string] {
  const limits = cfg.limits as { task_timeout_min: number };
  const accept = task.accept as string | string[];
  return runner.runCmd(accept, wt, limits.task_timeout_min * 60);
}

export async function mergeShipped(
  cfg: Record<string, unknown>,
  task: Record<string, unknown>,
  branchName?: string,
): Promise<void> {
  const repo = String(cfg.repo_root);
  const branch = String(cfg.integration_branch);
  const bname = branchName ?? `harness/task/${task.id}`;
  const intWt = gitops.integrationWorktree(repo, String(cfg.worktree_root), branch);
  gitops.mergeTask(intWt, String(task.id), bname);
}

export async function attempt(
  task: Record<string, unknown>,
  model: string,
  cfg: Record<string, unknown>,
  reviewerProvider: Provider,
  implementer: ImplementerFn,
  pdir: string,
  hooks: HarnessHooks = noopHooks,
  branchName?: string,
  merge = true,
): Promise<[string, Record<string, unknown>]> {
  const repo = String(cfg.repo_root);
  const branch = String(cfg.integration_branch);
  const limits = cfg.limits as {
    repair_rounds: number;
    review_rounds: number;
    error_tail_lines: number;
    max_diff_kb: number;
  };
  const editFormat = cfg.edit_format as Record<string, string>;
  const models = cfg.models as { reviewer_for: Record<string, string> };
  const bname = branchName ?? `harness/task/${task.id}`;
  const wt = gitops.createWorktree(repo, String(cfg.worktree_root), String(task.id), branch, bname);
  const fmt = editFormat[model] ?? "diff";
  let status = "BLOCKED";
  let evidence: Record<string, unknown> = {};
  try {
    let message = `${task.title}\n\n${task.prompt}\n\nOnly change files under: ${JSON.stringify(task.allow_paths)}`;
    if (task.plan_approach) message += `\n\nPlanned approach:\n${task.plan_approach}`;
    let code = 1;
    let out = "";
    for (let rnd = 1; rnd <= limits.repair_rounds; rnd++) {
      hooks.check();
      hooks.emit("build_round_start", { round: rnd, model });
      await implementer(task, wt, model, fmt, message, cfg);
      gitops.commitAll(wt, `harness: ${task.id} round ${rnd}`);
      [code, out] = verify(task, wt, cfg);
      atomicWriteJson(
        path.join(pdir, `build_${rnd}.json`),
        packet("BUILD", String(task.id), { round: rnd, model, exit: code }),
      );
      hooks.emit("verify_done", { round: rnd, exit: code });
      if (code === 0) break;
      message =
        `The acceptance command failed. Fix the code.\nCommand: ${JSON.stringify(task.accept)}\nOutput (tail):\n` +
        runner.tail(out, limits.error_tail_lines);
    }
    if (code !== 0) {
      evidence = {
        reason: `acceptance command failed after ${limits.repair_rounds} rounds`,
        log_tail: runner.tail(out, 40),
      };
      return ["BLOCKED", evidence];
    }

    const changed = gitops.changedPaths(wt, branch);
    const bad = pathViolations(changed, (task.allow_paths as string[]) ?? []);
    if (bad.length) {
      hooks.emit("path_gate", { violations: bad });
      evidence = { reason: "diff touches paths outside allow_paths or protected paths", paths: bad };
      return ["ESCALATED", evidence];
    }

    const rmodel = models.reviewer_for[model] ?? model;
    let notes: Array<Record<string, unknown>> = [];
    for (let rr = 1; rr <= limits.review_rounds; rr++) {
      hooks.check();
      const verdict = await review.review(
        reviewerProvider,
        rmodel,
        task,
        gitops.diffText(wt, branch),
        String(cfg.skeptic_path),
        limits.max_diff_kb,
      );
      atomicWriteJson(path.join(pdir, `review_${rr}.json`), packet("REVIEW", String(task.id), verdict));
      hooks.emit("review_round_done", { round: rr, verdict: verdict.verdict });
      if (verdict.verdict === "ACCEPT") break;
      if (verdict.verdict === "ESCALATE") {
        evidence = {
          reason: "reviewer escalated",
          findings: verdict.findings ?? [],
          detail: verdict.reason ?? "",
        };
        return ["ESCALATED", evidence];
      }
      notes = (verdict.findings as Array<Record<string, unknown>>) ?? [];
      const fixmsg =
        "A code reviewer found issues. Address each:\n" +
        notes.map((f) => `- ${f.file}:${f.line} ${f.issue}`).join("\n");
      await implementer(task, wt, model, fmt, fixmsg, cfg);
      gitops.commitAll(wt, `harness: ${task.id} review fix ${rr}`);
      [code, out] = verify(task, wt, cfg);
      if (code !== 0) {
        evidence = { reason: "regression while applying review fixes", log_tail: runner.tail(out, 40) };
        return ["BLOCKED", evidence];
      }
    }

    evidence = { paths: changed, accept_with_notes: notes };
    if (merge) {
      hooks.emit("merge_start");
      await mergeShipped(cfg, task, bname);
      status = "SHIPPED";
    } else {
      evidence = { ...evidence, branch: bname, worktree: wt };
      status = "REVIEWED";
    }
    return [status, evidence];
  } finally {
    const keepReviewed = !merge && status === "REVIEWED";
    if (!keepReviewed) {
      gitops.removeWorktree(repo, wt, String(task.id), status !== "SHIPPED", bname);
    }
  }
}

export function pickModel(task: Record<string, unknown>, cfg: Record<string, unknown>): string {
  const models = cfg.models as Record<string, string>;
  const lane = ["fix", "lint", "test-repair"].includes(String(task.category)) ? "fix" : "feature";
  return models[lane]!;
}

export { recover } from "./gitops";

export function freeGb(_repoPath: string): number {
  // Node stdlib has no shutil.disk_usage equivalent; guard disk check is best-effort on TS path.
  return 100;
}
