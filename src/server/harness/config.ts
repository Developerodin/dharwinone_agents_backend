/** Regex parse of backend/harness/config.yaml — no yaml dependency. */
import fs from "node:fs";
import { backendPath } from "../paths";

export type HarnessLimits = {
  repair_rounds: number;
  review_rounds: number;
  task_timeout_min: number;
  run_cap_hours: number;
  min_disk_gb: number;
  max_diff_kb: number;
  error_tail_lines: number;
  infra_failure_breaker: number;
  weak_winrate: number;
  weak_min_attempts: number;
  max_plan_files: number;
  health_deadline_s: number;
};

export type HarnessDefaults = {
  ollama_url: string;
  models: Record<string, unknown> & {
    feature: string;
    fix: string;
    planner: string;
    reviewer_for: Record<string, string>;
  };
  edit_format: Record<string, string>;
  limits: HarnessLimits;
  skeptic_path: string;
  tasks_path: string;
  generated_tasks_path: string;
};

function parseBlock(raw: string, key: string): string {
  const m = raw.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return m?.[1]?.trim() ?? "";
}

function parseNestedMap(raw: string, section: string): Record<string, string> {
  const lines = raw.split(/\r?\n/);
  const out: Record<string, string> = {};
  let inSection = false;
  let indent = 0;
  for (const line of lines) {
    if (!inSection) {
      if (line.match(new RegExp(`^${section}:\\s*$`))) {
        inSection = true;
        indent = 2;
      }
      continue;
    }
    if (line.trim() === "" || line.startsWith(" ") && line.search(/\S/) < indent) break;
    const m = line.match(/^\s{2,}(\S+):\s*(.+)$/);
    if (m) out[m[1]!] = m[2]!.trim();
  }
  return out;
}

function parseReviewerFor(raw: string): Record<string, string> {
  const lines = raw.split(/\r?\n/);
  const out: Record<string, string> = {};
  let inSection = false;
  for (const line of lines) {
    if (line.match(/^  reviewer_for:\s*$/)) {
      inSection = true;
      continue;
    }
    if (inSection) {
      const m = line.match(/^\s{4}(\S+):\s*(.+)$/);
      if (m) {
        out[m[1]!] = m[2]!.trim();
        continue;
      }
      if (line.match(/^\s{2}\S/) && !line.match(/^\s{4}/)) inSection = false;
    }
  }
  return out;
}

function parseLimits(raw: string): HarnessLimits {
  const block = parseNestedMap(raw, "limits");
  const num = (k: string, d: number) => parseInt(block[k] ?? String(d), 10);
  const fl = (k: string, d: number) => parseFloat(block[k] ?? String(d));
  return {
    repair_rounds: num("repair_rounds", 3),
    review_rounds: num("review_rounds", 2),
    task_timeout_min: num("task_timeout_min", 30),
    run_cap_hours: num("run_cap_hours", 8),
    min_disk_gb: num("min_disk_gb", 30),
    max_diff_kb: num("max_diff_kb", 64),
    error_tail_lines: num("error_tail_lines", 100),
    infra_failure_breaker: num("infra_failure_breaker", 3),
    weak_winrate: fl("weak_winrate", 0.5),
    weak_min_attempts: num("weak_min_attempts", 4),
    max_plan_files: num("max_plan_files", 8),
    health_deadline_s: num("health_deadline_s", 60),
  };
}

let cached: HarnessDefaults | null = null;

export function loadHarnessDefaults(): HarnessDefaults {
  if (cached) return cached;
  const raw = fs.readFileSync(backendPath("assets/harness/config.yaml"), "utf8");
  const modelsBlock = parseNestedMap(raw, "models");
  cached = {
    ollama_url: parseBlock(raw, "ollama_url") || "http://localhost:11434",
    models: {
      feature: modelsBlock.feature ?? "qwen3-coder-30b-harness",
      fix: modelsBlock.fix ?? "qwen25-coder-14b-harness",
      planner: modelsBlock.planner ?? "qwen3-coder-30b-harness",
      reviewer_for: parseReviewerFor(raw),
    },
    edit_format: parseNestedMap(raw, "edit_format"),
    limits: parseLimits(raw),
    skeptic_path: parseBlock(raw, "skeptic_path") || "assets/harness/skeptic.yaml",
    tasks_path: parseBlock(raw, "tasks_path") || "assets/harness/tasks.yaml",
    generated_tasks_path: parseBlock(raw, "generated_tasks_path") || "assets/harness/generated_tasks.yaml",
  };
  return cached;
}

export function resetHarnessConfigForTests(): void {
  cached = null;
}
