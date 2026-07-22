import fs from "node:fs";
import path from "node:path";
import { backendPath, dataDir, projectsPath, runDir, statsPath } from "./paths";
import { loadHarnessDefaults } from "./harness/config";
import { envProviderOverrides, mergeProjectProviders } from "./harness/providerConfig";

const SLUG_RE = /[^a-z0-9]+/g;

export class ProjectError extends Error {}

export type LegacyProject = Record<string, unknown> & {
  id: string;
  name: string;
  repo_root: string;
};

function slug(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(SLUG_RE, "-")
    .slice(0, 24)
    .replace(/^-+|-+$/g, "");
  return s || "project";
}

function ensureDataDir(): void {
  fs.mkdirSync(dataDir(), { recursive: true });
}

function atomicWriteJson(filePath: string, obj: unknown): void {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

export function loadAll(): LegacyProject[] {
  const p = projectsPath();
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, "utf-8");
  const data: unknown = JSON.parse(raw);
  return Array.isArray(data) ? (data as LegacyProject[]) : [];
}

export function saveAll(projects: LegacyProject[]): void {
  ensureDataDir();
  atomicWriteJson(projectsPath(), projects);
}

export function get(projectId: string): LegacyProject | null {
  for (const p of loadAll()) {
    if (p.id === projectId) return p;
  }
  return null;
}

function defaultAcceptTemplates(): Record<string, string[]> {
  return { default: ["node", "-e", "process.exit(0)"] };
}

export function create(fields: Record<string, unknown>): LegacyProject {
  const repoRoot = path.resolve(String(fields.repo_root));
  const gitDir = path.join(repoRoot, ".git");
  const isGitRepo = fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory();
  if (!isGitRepo) {
    throw new ProjectError(`repo_root is not a git repository: ${repoRoot}`);
  }

  const base = slug(String(fields.name));
  const existing = new Set(loadAll().map((p) => p.id));
  let pid = base;
  let n = 2;
  while (existing.has(pid)) {
    const suffix = `-${n}`;
    pid = (base.slice(0, 24 - suffix.length) + suffix).replace(/^-+|-+$/g, "");
    n += 1;
  }

  const project: LegacyProject = {
    id: pid,
    name: fields.name as string,
    repo_root: repoRoot,
    integration_branch: (fields.integration_branch as string | undefined) ?? "harness/integration",
    dev_cmd: (fields.dev_cmd as string | undefined) ?? "npm run dev",
    dev_port_range: fields.dev_port_range ?? [4310, 4399],
    accept_templates: fields.accept_templates ?? defaultAcceptTemplates(),
    privacy: (fields.privacy as string | undefined) ?? "local_only",
    stage_consents: fields.stage_consents ?? [],
    providers: fields.providers ?? null,
    knowledge_path: (fields.knowledge_path as string | undefined) ?? "knowledge.yaml",
  };

  const all = loadAll();
  all.push(project);
  saveAll(all);
  return project;
}

export function deriveHarnessCfg(project: LegacyProject, runId: string): Record<string, unknown> {
  const defaults = loadHarnessDefaults();
  const runRoot = runDir(project.id, runId);
  const wtRoot = path.join("C:/wt", project.id);
  const mergedProviders = mergeProjectProviders(
    project.providers as Record<string, { kind?: string; model?: string; baseUrl?: string }> | null,
  );
  return {
    ollama_url: defaults.ollama_url,
    repo_root: project.repo_root,
    worktree_root: wtRoot,
    integration_branch: project.integration_branch ?? "harness/integration",
    skeptic_path: backendPath(defaults.skeptic_path),
    tasks_path: backendPath(defaults.tasks_path),
    generated_tasks_path: backendPath(defaults.generated_tasks_path),
    journal_path: path.join(runRoot, "journal.jsonl"),
    stats_path: statsPath(project.id),
    packets_dir: path.join(runRoot, "packets"),
    report_path: path.join(runRoot, "report.md"),
    models: defaults.models,
    edit_format: defaults.edit_format,
    limits: defaults.limits,
    accept_templates: project.accept_templates ?? {},
    providers: mergedProviders,
  };
}
