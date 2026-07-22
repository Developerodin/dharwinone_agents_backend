/** Cloud LLM code implementer — replaces aider/Ollama for production runs. */
import fs from "node:fs";
import path from "node:path";
import type { Provider } from "../providers";
import type { ImplementerFn } from "./supervisor";

function underAllow(rel: string, allowPaths: string[]): boolean {
  const norm = rel.replace(/\\/g, "/");
  return allowPaths.some((p) => norm === p || norm.startsWith(`${p.replace(/\/$/, "")}/`));
}

function collectFiles(task: Record<string, unknown>, wt: string, allowPaths: string[]): string[] {
  const planned = (task.plan_files as string[] | undefined) ?? [];
  const fromPlan = planned.filter((f) => fs.existsSync(path.join(wt, f)));
  if (fromPlan.length) return fromPlan;
  const found: string[] = [];
  for (const root of allowPaths) {
    const abs = path.join(wt, root);
    if (!fs.existsSync(abs)) continue;
    const stat = fs.statSync(abs);
    if (stat.isFile()) {
      found.push(root);
      continue;
    }
    walk(abs, wt, found);
  }
  return found.slice(0, 12);
}

function walk(dir: string, wt: string, out: string[]): void {
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith(".") || name === "node_modules") continue;
    const abs = path.join(dir, name);
    const rel = path.relative(wt, abs).replace(/\\/g, "/");
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) walk(abs, wt, out);
    else if (/\.(tsx?|jsx?|css|html|json|md|yaml|yml)$/.test(name)) out.push(rel);
  }
}

function readBundle(wt: string, files: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of files) {
    const abs = path.join(wt, f);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      out[f] = fs.readFileSync(abs, "utf8");
    }
  }
  return out;
}

function parseEdits(raw: string): Record<string, string> {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const files = (parsed.files ?? parsed.edits) as Record<string, string> | undefined;
  if (!files || typeof files !== "object") {
    throw new Error("LLM response missing files map");
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(files)) {
    if (typeof v === "string") out[k.replace(/\\/g, "/")] = v;
  }
  return out;
}

function applyEdits(wt: string, edits: Record<string, string>, allowPaths: string[]): void {
  for (const [rel, content] of Object.entries(edits)) {
    if (!underAllow(rel, allowPaths)) {
      throw new Error(`edit outside allow_paths: ${rel}`);
    }
    const abs = path.join(wt, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");
  }
}

export function makeCloudImplementer(getProvider: () => Provider, getModel: () => string): ImplementerFn {
  return async (task, wt, _model, _fmt, message, _cfg) => {
    const allowPaths = (task.allow_paths as string[]) ?? [];
    const files = collectFiles(task, wt, allowPaths);
    const bundle = readBundle(wt, files);
    const prompt =
      "You are a code implementer. Respond ONLY with JSON:\n" +
      '{"files": {"relative/path": "full new file content"}}\n' +
      `Task:\n${message}\n\n` +
      `Allowed paths: ${JSON.stringify(allowPaths)}\n\n` +
      `Current files:\n${JSON.stringify(bundle)}`;
    const provider = getProvider();
    const model = getModel();
    const raw = await provider.generate(model, prompt, { jsonMode: true, timeoutS: 600 });
    applyEdits(wt, parseEdits(raw), allowPaths);
  };
}
