/** Shared helpers for /runs API routes. */
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { PrivacyViolation, makePolicy, wrapProvider } from "./consent";
import { refine, sanitizeHtml } from "./draft";
import * as legacyProjects from "./legacyProjects";
import { atomicWriteJson, journalRead, JournalWriter } from "./packets";
import { backendPath } from "./paths";
import { get, type Provider, type ProviderConfig } from "./providers";
import { readChoice } from "./runDraft";
import { findRunDir, loadRun, startMonitor, type RunRecord } from "./runs";

let monitorBooted = false;

export function ensureRunMonitor(): void {
  if (!monitorBooted) {
    startMonitor();
    monitorBooted = true;
  }
}

export function getRunOr404(runId: string): RunRecord | NextResponse {
  const run = loadRun(runId);
  if (!run) return NextResponse.json({ detail: "run not found" }, { status: 404 });
  return run;
}

export function ensureBuildEditing(run: RunRecord): NextResponse | null {
  if (run.lane !== "build") {
    return NextResponse.json({ detail: "not a build-lane run" }, { status: 409 });
  }
  if (run.state !== "editing") {
    return NextResponse.json({ detail: "run is not editable" }, { status: 409 });
  }
  return null;
}

export function workingPath(runId: string): [string, string] | NextResponse {
  const runDir = findRunDir(runId);
  if (!runDir) return NextResponse.json({ detail: "run directory not found" }, { status: 404 });
  return [runDir, path.join(runDir, "working.html")];
}

export function appendEditLog(
  runDir: string,
  source: string,
  prompt?: string,
  ok = true,
): void {
  const logPath = path.join(runDir, "edit-log.jsonl");
  const entry: Record<string, unknown> = { ts: Date.now() / 1000, source, ok };
  if (prompt) entry.prompt = prompt;
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf-8");
}

function parseHarnessModels(): Record<string, string> {
  const raw = fs.readFileSync(backendPath("assets/harness/config.yaml"), "utf-8");
  const planner = raw.match(/^\s+planner:\s*(\S+)/m)?.[1] ?? "qwen2.5-coder:14b";
  return { planner };
}

export async function plannerProvider(
  project: legacyProjects.LegacyProject,
  runId: string,
): Promise<[Provider, string]> {
  const cfg = legacyProjects.deriveHarnessCfg(project, runId);
  const providersCfg = (project.providers as ProviderConfig["providers"]) ?? {};
  const stageCfg = providersCfg.planner ?? {};
  const kind = stageCfg.kind ?? "ollama";
  const model = stageCfg.model ?? parseHarnessModels().planner;
  const merged: ProviderConfig = {
    ollamaUrl: String(cfg.ollama_url ?? "http://localhost:11434"),
    providers: project.providers as ProviderConfig["providers"],
  };
  const policy = makePolicy(project, runId);
  let provider = get(merged, "planner", policy);
  if (kind === "anthropic" || kind === "openai") {
    provider = wrapProvider(provider, project, runId, "planner", kind, model);
  }
  return [provider, model];
}

export async function editWorkingHtml(
  run: RunRecord,
  prompt: string,
): Promise<{ html: string } | NextResponse> {
  const project = legacyProjects.get(run.project_id);
  if (!project) return NextResponse.json({ detail: "project not found" }, { status: 404 });
  const wp = workingPath(run.run_id);
  if (wp instanceof NextResponse) return wp;
  const [runDir, working] = wp;
  if (!fs.existsSync(working)) {
    return NextResponse.json({ detail: "working draft not found" }, { status: 404 });
  }
  let html = fs.readFileSync(working, "utf-8");
  let styleReferenceHtml: string | undefined;
  const choice = readChoice(runDir);
  if (choice && typeof choice.variant === "number") {
    const source = path.join(runDir, `draft-${choice.variant}.html`);
    if (fs.existsSync(source)) styleReferenceHtml = fs.readFileSync(source, "utf-8");
  } else if (choice && typeof choice.variant === "string" && /^\d+$/.test(choice.variant)) {
    const source = path.join(runDir, `draft-${choice.variant}.html`);
    if (fs.existsSync(source)) styleReferenceHtml = fs.readFileSync(source, "utf-8");
  }
  try {
    const [provider, model] = await plannerProvider(project, run.run_id);
    const edited = await refine(provider, model, html, prompt, { styleReferenceHtml });
    if (!edited) return NextResponse.json({ detail: "model returned invalid html" }, { status: 502 });
    fs.writeFileSync(working, edited, "utf-8");
    appendEditLog(runDir, "chat", prompt);
    const cfg = legacyProjects.deriveHarnessCfg(project, run.run_id);
    new JournalWriter(String(cfg.journal_path), run.run_id).emit("edit_applied", {
      source: "chat",
      prompt,
    });
    return { html: edited };
  } catch (exc) {
    if (exc instanceof PrivacyViolation) {
      return NextResponse.json({ detail: exc.message }, { status: 403 });
    }
    return NextResponse.json({ detail: `edit failed: ${exc}` }, { status: 502 });
  }
}

export function validateWorkingHtml(html: string): NextResponse | null {
  if (Buffer.byteLength(html, "utf-8") > 512 * 1024) {
    return NextResponse.json({ detail: "working draft exceeds 512KB" }, { status: 422 });
  }
  const low = html.toLowerCase();
  if (!low.includes("<html") || !low.includes("</html>")) {
    return NextResponse.json({ detail: "working draft must be full html" }, { status: 422 });
  }
  if (/<script\b/i.test(html)) {
    return NextResponse.json({ detail: "script tags are not allowed" }, { status: 422 });
  }
  if (/\son\w+\s*=/i.test(html)) {
    return NextResponse.json({ detail: "inline handlers are not allowed" }, { status: 422 });
  }
  if (/javascript\s*:/i.test(html)) {
    return NextResponse.json({ detail: "javascript urls are not allowed" }, { status: 422 });
  }
  return null;
}

export function writeWorkingHtml(run: RunRecord, html: string): NextResponse {
  const wp = workingPath(run.run_id);
  if (wp instanceof NextResponse) return wp;
  const [runDir, working] = wp;
  fs.writeFileSync(working, sanitizeHtml(html), "utf-8");
  appendEditLog(runDir, "manual");
  const project = legacyProjects.get(run.project_id);
  if (project) {
    const cfg = legacyProjects.deriveHarnessCfg(project, run.run_id);
    new JournalWriter(String(cfg.journal_path), run.run_id).emit("edit_applied", { source: "manual" });
  }
  return NextResponse.json({ ok: true });
}

export { journalRead, atomicWriteJson } from "./packets";
export { sanitizeHtml } from "./draft";
