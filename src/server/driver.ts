/** Port of backend/studio/driver.py — gated task driver over harness primitives. */
import fs from "node:fs";
import path from "node:path";
import * as analysis from "./harness/analysis";
import * as gitops from "./harness/gitops";
import { guard } from "./harness/guard";
import { freeGb, mergeShipped, pickModel, planTask, attempt, type HarnessHooks, type ImplementerFn } from "./harness/supervisor";
import { buildPromptContext } from "./knowledge";
import { waitGate } from "./gates";
import { atomicWriteJson, JournalWriter, packet } from "./packets";
import { get, type Provider, type ProviderConfig } from "./providers";
import { wrapProvider } from "./consent";
import { readChoice } from "./runDraft";
import { STYLE_PACKS } from "./draft";
import type { LegacyProject } from "./legacyProjects";

const CLOUD_KINDS = new Set(["anthropic", "openai"]);

class DriverHooks implements HarnessHooks {
  constructor(private jw: JournalWriter) {}

  emit(event: string, fields: Record<string, unknown> = {}): void {
    this.jw.emit(event, fields);
  }

  check(): void {
    /* cooperative cancel checked via AbortSignal in waitGate/attempt loops */
  }
}

function plannerModel(cfg: Record<string, unknown>, project: LegacyProject): string {
  const prov = (project.providers as Record<string, { model?: string }> | null)?.planner;
  if (prov?.model) return prov.model;
  return (cfg.models as Record<string, string>).planner!;
}

function stageProvider(
  cfg: Record<string, unknown>,
  project: LegacyProject,
  stage: string,
  policy?: (stage: string, kind: string, model: string) => void,
  runId?: string,
): Provider {
  const merged: ProviderConfig = {
    ollamaUrl: String(cfg.ollama_url),
    providers: {
      ...((project.providers as Record<string, { kind?: string; model?: string; baseUrl?: string }>) ?? {}),
      ...((cfg.providers as Record<string, { kind?: string; model?: string; baseUrl?: string }>) ?? {}),
    },
  };
  const stageCfg = merged.providers?.[stage] ?? {};
  const kind = stageCfg.kind ?? "ollama";
  const model = stageCfg.model ?? "";
  const prov = get(merged, stage, policy);
  if (runId && CLOUD_KINDS.has(kind)) {
    return wrapProvider(prov, project, runId, stage, kind, model);
  }
  return prov;
}

function taskPacketsDir(cfg: Record<string, unknown>, taskId: string): string {
  return path.join(String(cfg.packets_dir), taskId);
}

function writePacket(cfg: Record<string, unknown>, taskId: string, name: string, body: unknown): void {
  const pdir = taskPacketsDir(cfg, taskId);
  fs.mkdirSync(pdir, { recursive: true });
  atomicWriteJson(path.join(pdir, name), body);
}

function terminal(jw: JournalWriter, event: string, taskId: string, fields: Record<string, unknown> = {}): void {
  jw.emit(event, { task: taskId, ...fields });
}

function incident(cfg: Record<string, unknown>, taskId: string, evidence: Record<string, unknown>): void {
  writePacket(cfg, taskId, "incident.json", packet("INCIDENT", taskId, evidence));
}

function writePlanMd(
  cfg: Record<string, unknown>,
  taskId: string,
  task: Record<string, unknown>,
  plan: { approach: string; files: string[] },
  explainFields: Record<string, unknown>,
  simFields: Record<string, unknown>,
): void {
  const blast = (simFields.blast_files as string[]) ?? [];
  const lines = [
    `# Plan — ${task.title}`,
    "",
    `Run: \`${taskId}\``,
    "",
    "## Approach",
    "",
    plan.approach,
    "",
    "## Files",
    "",
    ...plan.files.map((p) => `- \`${p}\``),
    "",
    "## Summary",
    "",
    String(explainFields.summary ?? "(unavailable)"),
    "",
    "## Blast radius",
    "",
    `Risk: ${simFields.risk ?? "—"} · ${simFields.blast_count ?? 0} files touched (${simFields.size_band ?? "—"})`,
    "",
    ...(blast.length ? blast.map((p) => `- \`${p}\``) : ["- no direct importers detected"]),
    "",
  ];
  fs.writeFileSync(path.join(taskPacketsDir(cfg, taskId), "plan.md"), lines.join("\n"), "utf8");
}

function loadPlanPacket(cfg: Record<string, unknown>, taskId: string): { approach: string; files: string[] } {
  const body = JSON.parse(fs.readFileSync(path.join(taskPacketsDir(cfg, taskId), "plan.json"), "utf8")) as Record<
    string,
    unknown
  >;
  return { approach: String(body.approach), files: body.files as string[] };
}

function acceptEvidence(cfg: Record<string, unknown>, taskId: string): { worktree: string; branch: string } {
  const wt = path.join(String(cfg.worktree_root), taskId);
  const branch = gitops.git(["rev-parse", "--abbrev-ref", "HEAD"], wt).trim();
  return { worktree: wt, branch };
}

export async function runTask(
  project: LegacyProject,
  runId: string,
  task: Record<string, unknown>,
  cfg: Record<string, unknown>,
  implementer: ImplementerFn,
  gateTimeoutS = 3600,
  resumeFrom: string | null = null,
  policy?: (stage: string, kind: string, model: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const runDir = path.dirname(String(cfg.journal_path));
  const jw = new JournalWriter(String(cfg.journal_path), runId);
  const hooks = new DriverHooks(jw);
  const taskId = String(task.id);
  const pdir = taskPacketsDir(cfg, taskId);
  fs.mkdirSync(pdir, { recursive: true });
  fs.mkdirSync(String(cfg.worktree_root), { recursive: true });
  gitops.ensureIntegration(String(cfg.repo_root), String(cfg.integration_branch));

  const ctx = buildPromptContext(project);
  let workTask = { ...task };
  if (ctx) workTask = { ...workTask, prompt: `${ctx}\n\n${workTask.prompt}` };

  let workCfg = cfg;
  if (workTask.category === "build") {
    const limits = cfg.limits as Record<string, number>;
    workCfg = {
      ...cfg,
      limits: { ...limits, max_plan_files: Math.max(30, limits.max_plan_files ?? 8) },
    };
  }

  if (resumeFrom === "accept") {
    const evidence = acceptEvidence(workCfg, taskId);
    jw.emit("accept_ready");
    const acceptGate = await waitGate(runDir, "accept", gateTimeoutS, jw, signal);
    if (acceptGate.decision === "approve") {
      gitops.removeWorktree(String(workCfg.repo_root), evidence.worktree, taskId, true, evidence.branch);
      hooks.emit("merge_start");
      await mergeShipped(workCfg, workTask, evidence.branch);
      gitops.git(["branch", "-D", evidence.branch], String(workCfg.repo_root));
      terminal(jw, "shipped", taskId, { evidence });
      return "SHIPPED";
    }
    if (acceptGate.decision === "reject") {
      gitops.removeWorktree(String(workCfg.repo_root), evidence.worktree, taskId, false, evidence.branch);
      terminal(jw, "rejected_by_user", taskId, { gate: "accept" });
      return "REJECTED";
    }
    terminal(jw, "paused", taskId, { gate: "accept" });
    return "PAUSED";
  }

  let plan: { approach: string; files: string[] };

  if (resumeFrom !== "plan") {
    jw.emit("run_start", { task: taskId });
    const violations = await guard(workTask, workCfg, freeGb(String(workCfg.repo_root)));
    if (violations.length) {
      jw.emit("guard_reject", { violations });
      incident(workCfg, taskId, { reason: "guard", violations });
      terminal(jw, "escalated", taskId, { evidence: { reason: "guard", violations } });
      return "ESCALATED";
    }

    const planner = stageProvider(workCfg, project, "planner", policy, runId);
    const pmodel = plannerModel(workCfg, project);
    hooks.emit("plan_start", { model: pmodel });
    const planned = await planTask(planner, workCfg, workTask);
    if (!planned) {
      incident(workCfg, taskId, { reason: "unplannable or scope explosion" });
      terminal(jw, "escalated", taskId, { evidence: { reason: "unplannable or scope explosion" } });
      return "ESCALATED";
    }
    plan = planned;
    writePacket(workCfg, taskId, "plan.json", packet("PLAN", taskId, plan));
    hooks.emit("plan_ready");

    jw.emit("explain_start");
    const explainBody = await analysis.explain(planner, pmodel, workTask, plan.files, String(workCfg.repo_root));
    const explainFields = Object.fromEntries(Object.entries(explainBody).filter(([k]) => k !== "kind"));
    writePacket(workCfg, taskId, "explain.json", packet("EXPLAIN", taskId, explainFields));
    jw.emit("explain_ready");

    const simBody = analysis.simulate(String(workCfg.repo_root), plan.files);
    const simFields = Object.fromEntries(Object.entries(simBody).filter(([k]) => k !== "kind"));
    writePacket(workCfg, taskId, "simulate.json", packet("SIMULATE", taskId, simFields));
    writePlanMd(workCfg, taskId, workTask, plan, explainFields, simFields);
    jw.emit("simulate_ready");
  } else {
    plan = loadPlanPacket(workCfg, taskId);
    await guard(workTask, workCfg, freeGb(String(workCfg.repo_root)));
  }

  const planGate = await waitGate(runDir, "plan", gateTimeoutS, jw, signal);
  if (planGate.decision === "reject") {
    terminal(jw, "rejected_by_user", taskId, { gate: "plan" });
    return "REJECTED";
  }
  if (planGate.decision === "timeout") {
    terminal(jw, "paused", taskId, { gate: "plan" });
    return "PAUSED";
  }

  const payload = (planGate.payload as Record<string, unknown>) ?? {};
  workTask = {
    ...workTask,
    plan_approach: payload.approach ?? plan.approach,
    plan_files: payload.files ?? plan.files,
  };

  const workingFile = String(workTask.working_file ?? "working.html");
  const workingPath = path.join(runDir, workingFile);
  if (fs.existsSync(workingPath)) {
    workTask.prompt = `${workTask.prompt}\n\nUse ${workingFile} in the run directory as the approved static design source. Keep its sections and visual language unless the user plan explicitly asks for structural changes.`;
  }

  const choice = readChoice(runDir);
  if (choice) {
    const pack = STYLE_PACKS.find((p) => p.id === choice.id);
    let style = `Visual direction: the user chose the '${choice.label}' design draft.`;
    if (pack?.accent) {
      style += ` Use this palette — accent ${pack.accent}, text ${pack.ink}, background ${pack.bg}, surfaces ${pack.surface}; font stack ${pack.font}.`;
    } else if (fs.existsSync(path.join(runDir, "draft-custom.html"))) {
      style += " A personalized copy of that template is at draft-custom.html in the run directory; match its layout, sections, and content.";
    }
    workTask.prompt = `${workTask.prompt}\n\n${style}`;
  }

  const model = pickModel(workTask, workCfg);
  const merged = {
    ...((workCfg.providers as Record<string, unknown>) ?? {}),
    ...((project.providers as Record<string, unknown>) ?? {}),
  };
  const reviewStage = merged.reviewer ? "reviewer" : "implementer_llm";
  const reviewerProvider = stageProvider(workCfg, project, reviewStage, policy, runId);
  const [status, evidence] = await attempt(
    workTask,
    model,
    workCfg,
    reviewerProvider,
    implementer,
    pdir,
    hooks,
    undefined,
    false,
  );

  if (status === "REVIEWED") {
    jw.emit("accept_ready");
    const acceptGate = await waitGate(runDir, "accept", gateTimeoutS, jw, signal);
    if (acceptGate.decision === "approve") {
      const ev = evidence as { branch: string; worktree: string };
      gitops.removeWorktree(String(workCfg.repo_root), ev.worktree, taskId, true, ev.branch);
      hooks.emit("merge_start");
      await mergeShipped(workCfg, workTask, ev.branch);
      gitops.git(["branch", "-D", ev.branch], String(workCfg.repo_root));
      terminal(jw, "shipped", taskId, { evidence });
      return "SHIPPED";
    }
    if (acceptGate.decision === "reject") {
      const ev = evidence as { branch: string; worktree: string };
      gitops.removeWorktree(String(workCfg.repo_root), ev.worktree, taskId, false, ev.branch);
      terminal(jw, "rejected_by_user", taskId, { gate: "accept" });
      return "REJECTED";
    }
    terminal(jw, "paused", taskId, { gate: "accept" });
    return "PAUSED";
  }

  incident(workCfg, taskId, evidence);
  terminal(jw, status.toLowerCase(), taskId, { evidence });
  return status;
}
