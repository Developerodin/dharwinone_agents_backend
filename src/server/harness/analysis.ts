/** Port of backend/harness/analysis.py — simulate + explain stages. */
import fs from "node:fs";
import path from "node:path";
import { PROTECTED } from "./guard";
import type { Provider } from "../providers";

const JS_IMPORT = /import\s+(?:[\w*{}\s,]+\s+from\s+)?['"](\.[^'"]+)['"]/g;
const JS_REQUIRE = /require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;

function normPath(p: string): string {
  return p.replace(/\\/g, "/");
}

function resolveRelative(baseFile: string, rel: string): string[] {
  const base = path.dirname(baseFile);
  const raw = path.normalize(path.join(base, rel));
  const candidates: string[] = [];
  for (const ext of ["", ".py", ".ts", ".tsx", ".js", ".jsx"]) {
    candidates.push(normPath(ext ? `${raw}${ext}` : raw));
  }
  return candidates;
}

function indexPython(repoRoot: string): Record<string, string> {
  const idx: Record<string, string> = {};
  function walk(dir: string): void {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (name === ".git") continue;
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else if (name.endsWith(".py")) {
        const rel = normPath(path.relative(repoRoot, full));
        const stem = rel.slice(0, -3);
        idx[stem] = rel;
        idx[path.basename(stem)] = rel;
      }
    }
  }
  walk(repoRoot);
  return idx;
}

function jsImports(filePath: string, text: string): string[] {
  const refs: string[] = [];
  for (const pat of [JS_IMPORT, JS_REQUIRE]) {
    for (const m of text.matchAll(pat)) refs.push(...resolveRelative(filePath, m[1]!));
  }
  return refs;
}

function buildGraph(repoRoot: string): Record<string, Set<string>> {
  const graph: Record<string, Set<string>> = {};
  function walk(dir: string): void {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (name === ".git") continue;
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(py|js|ts|tsx|jsx)$/.test(name)) continue;
      const rel = normPath(path.relative(repoRoot, full));
      let text = "";
      try {
        text = fs.readFileSync(full, "utf8");
      } catch {
        continue;
      }
      const targets = name.endsWith(".py") ? [] : jsImports(rel, text);
      graph[rel] = new Set(targets);
    }
  }
  walk(repoRoot);
  return graph;
}

function reverseGraph(graph: Record<string, Set<string>>): Record<string, Set<string>> {
  const rev: Record<string, Set<string>> = {};
  for (const [src, targets] of Object.entries(graph)) {
    if (!rev[src]) rev[src] = new Set();
    for (const t of targets) {
      if (!rev[t]) rev[t] = new Set();
      rev[t]!.add(src);
    }
  }
  return rev;
}

function blastRadius(rev: Record<string, Set<string>>, planFiles: string[]): string[] {
  const planNorm = new Set(planFiles.map(normPath));
  const seen = new Set(planNorm);
  const queue = [...planNorm];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const importer of rev[cur] ?? []) {
      if (!seen.has(importer)) {
        seen.add(importer);
        queue.push(importer);
      }
    }
  }
  return [...seen].filter((p) => !planNorm.has(p)).sort();
}

function sizeBand(n: number): string {
  if (n <= 2) return "S";
  if (n <= 6) return "M";
  return "L";
}

function risk(blastFiles: string[], blastCount: number): string {
  if (blastFiles.some((b) => PROTECTED.some((p) => b.startsWith(p)))) return "high";
  if (blastCount > 20) return "high";
  if (blastCount > 8) return "medium";
  return "low";
}

export function simulate(repoRoot: string, planFiles: string[]): Record<string, unknown> {
  const graph = buildGraph(repoRoot);
  const rev = reverseGraph(graph);
  const blast = blastRadius(rev, planFiles);
  const blastCount = blast.length;
  return {
    kind: "SIMULATE",
    blast_files: blast,
    blast_count: blastCount,
    size_band: sizeBand(planFiles.length),
    risk: risk(blast, blastCount),
  };
}

function readCapped(repoRoot: string, rel: string, limit = 200): string {
  const full = path.join(repoRoot, rel.replace(/\//g, path.sep));
  try {
    return fs
      .readFileSync(full, "utf8")
      .split(/\r?\n/)
      .slice(0, limit)
      .join("\n");
  } catch {
    return "";
  }
}

export async function explain(
  provider: Provider,
  model: string,
  task: Record<string, unknown>,
  planFiles: string[],
  repoRoot: string,
): Promise<Record<string, unknown>> {
  try {
    const sim = simulate(repoRoot, planFiles);
    const snippets: string[] = [];
    for (const pf of planFiles) {
      const body = readCapped(repoRoot, pf);
      if (body) snippets.push(`--- ${pf} ---\n${body}`);
    }
    const prompt =
      "Summarize this coding plan for a human reviewer. " +
      'Respond ONLY with JSON: {"summary": "...", "files": ["..."]}\n' +
      `Task: ${task.title ?? ""}\n${task.prompt ?? ""}\n` +
      `Plan files: ${JSON.stringify(planFiles)}\n` +
      `Direct importers (blast): ${JSON.stringify((sim.blast_files as string[]).slice(0, 20))}\n\n` +
      snippets.join("\n\n");
    const raw = await provider.generate(model, prompt, { jsonMode: true });
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (obj?.summary) {
      let files = obj.files;
      if (!Array.isArray(files)) files = planFiles;
      return { kind: "EXPLAIN", summary: obj.summary, files };
    }
  } catch {
    /* best-effort */
  }
  return { kind: "EXPLAIN", summary: "(unavailable)", files: [...planFiles] };
}
