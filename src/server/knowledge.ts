// Port of backend/studio/knowledge.py — project knowledge.yaml validation and
// prompt-context rendering.
//
// Read/write use a minimal hand-written YAML encoder/decoder scoped EXACTLY to
// this module's fixed schema (SCHEMA_KEYS below): flat lists of strings
// (stack, rules), a flat string->string map (design_tokens), and a scalar
// string (deploy_branch). No general-purpose YAML npm package is wired into
// this app yet — this parser round-trips this schema correctly but is NOT a
// general YAML implementation; don't feed it hand-authored YAML outside these
// shapes (comments, anchors, multi-doc, …).
import fs from "node:fs";
import path from "node:path";

const SCHEMA_KEYS = new Set(["stack", "rules", "design_tokens", "deploy_branch"]);

export class KnowledgeError extends Error {}

export type KnowledgeData = {
  stack?: string[];
  rules?: string[];
  design_tokens?: Record<string, string>;
  deploy_branch?: string;
};

export type KnowledgeProject = { repo_root: string; knowledge_path?: string };

function validate(data: unknown, p = "$"): KnowledgeData {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new KnowledgeError(`${p}: must be an object`);
  }
  const obj = data as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!SCHEMA_KEYS.has(key)) throw new KnowledgeError(`${p}.${key}: unknown key`);
  }
  if ("stack" in obj && !Array.isArray(obj.stack)) {
    throw new KnowledgeError(`${p}.stack: must be a list`);
  }
  if ("rules" in obj && !Array.isArray(obj.rules)) {
    throw new KnowledgeError(`${p}.rules: must be a list`);
  }
  if ("design_tokens" in obj) {
    const dt = obj.design_tokens;
    if (typeof dt !== "object" || dt === null || Array.isArray(dt)) {
      throw new KnowledgeError(`${p}.design_tokens: must be an object`);
    }
    for (const [k, v] of Object.entries(dt as Record<string, unknown>)) {
      if (typeof v !== "string") throw new KnowledgeError(`${p}.design_tokens.${k}: must be a string`);
    }
  }
  if ("deploy_branch" in obj && typeof obj.deploy_branch !== "string") {
    throw new KnowledgeError(`${p}.deploy_branch: must be a string`);
  }
  return obj as KnowledgeData;
}

export function knowledgePath(project: KnowledgeProject): string {
  return path.join(project.repo_root, project.knowledge_path || "knowledge.yaml");
}

export function read(project: KnowledgeProject): KnowledgeData {
  const p = knowledgePath(project);
  if (!fs.existsSync(p)) return {};
  const raw = fs.readFileSync(p, "utf-8");
  return validate(parseKnowledgeYaml(raw));
}

export function write(project: KnowledgeProject, data: unknown): KnowledgeData {
  const validated = validate(data);
  const p = knowledgePath(project);
  fs.writeFileSync(p, stringifyKnowledgeYaml(validated), "utf-8");
  return validated;
}

// Port of build_prompt_context: renders the PROJECT KNOWLEDGE block for
// planner/implementer prompts. Swallows read failures exactly like the
// Python `except (KnowledgeError, OSError): return ""`.
export function buildPromptContext(project: KnowledgeProject): string {
  let data: KnowledgeData;
  try {
    data = read(project);
  } catch {
    return "";
  }
  if (!data || Object.keys(data).length === 0) return "";
  const lines: string[] = ["PROJECT KNOWLEDGE:"];
  if (data.stack && data.stack.length) lines.push("Stack: " + data.stack.join(", "));
  if (data.rules && data.rules.length) {
    lines.push("Rules:");
    for (const r of data.rules) lines.push(`  - ${r}`);
  }
  if (data.design_tokens && Object.keys(data.design_tokens).length) {
    lines.push("Design tokens:");
    for (const [k, v] of Object.entries(data.design_tokens)) lines.push(`  ${k}: ${v}`);
  }
  if (data.deploy_branch) lines.push(`Deploy branch: ${data.deploy_branch}`);
  return lines.join("\n");
}

// --- minimal YAML subset for the fixed knowledge schema ---

function yamlScalar(raw: string): string {
  const s = raw;
  const needsQuoting =
    s === "" ||
    /^\s|\s$/.test(s) ||
    /^[-?:,[\]{}#&*!|>'"%@`]/.test(s) ||
    /: |:$/.test(s) ||
    /^(true|false|null|~|-?\d+(\.\d+)?)$/i.test(s);
  return needsQuoting ? JSON.stringify(s) : s;
}

function stringifyKnowledgeYaml(data: KnowledgeData): string {
  const lines: string[] = [];
  const keys = (Object.keys(data) as Array<keyof KnowledgeData>).sort();
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) lines.push(`- ${yamlScalar(String(item))}`);
      }
    } else if (value && typeof value === "object") {
      const entries = Object.entries(value);
      if (entries.length === 0) {
        lines.push(`${key}: {}`);
      } else {
        lines.push(`${key}:`);
        for (const [k, v] of entries) lines.push(`  ${k}: ${yamlScalar(String(v))}`);
      }
    } else if (value !== undefined) {
      lines.push(`${key}: ${yamlScalar(String(value))}`);
    }
  }
  return lines.join("\n") + "\n";
}

function unquote(raw: string): unknown {
  const s = raw.trim();
  if (s === "") return null;
  if (s === "[]") return [];
  if (s === "{}") return {};
  if (s.startsWith('"') && s.endsWith('"')) {
    try {
      return JSON.parse(s);
    } catch {
      // fall through to raw string
    }
  }
  if (s.startsWith("'") && s.endsWith("'")) {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  return s;
}

function parseKnowledgeYaml(text: string): Record<string, unknown> {
  const rawLines = text.split(/\r?\n/).map((l) => l.replace(/\r$/, ""));
  const result: Record<string, unknown> = {};
  let i = 0;

  while (i < rawLines.length) {
    const line = rawLines[i];
    if (line.trim() === "" || line.trim().startsWith("#")) {
      i++;
      continue;
    }
    const indent = line.length - line.trimStart().length;
    if (indent !== 0) {
      i++;
      continue;
    }
    const trimmed = line.trim();
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) {
      i++;
      continue;
    }
    const key = trimmed.slice(0, colonIdx).trim();
    const rest = trimmed.slice(colonIdx + 1).trim();
    i++;

    if (rest === "[]") {
      result[key] = [];
      continue;
    }
    if (rest === "{}") {
      result[key] = {};
      continue;
    }
    if (rest !== "") {
      result[key] = unquote(rest);
      continue;
    }

    let j = i;
    while (j < rawLines.length && rawLines[j].trim() === "") j++;
    if (j >= rawLines.length) {
      result[key] = {};
      continue;
    }
    const nextLine = rawLines[j];
    const nextIndent = nextLine.length - nextLine.trimStart().length;
    const nextTrim = nextLine.trim();

    if (nextTrim.startsWith("- ") || nextTrim === "-") {
      if (nextIndent < indent) {
        result[key] = {};
        continue;
      }
      const items: unknown[] = [];
      i = j;
      while (i < rawLines.length) {
        const l = rawLines[i];
        if (l.trim() === "") {
          i++;
          continue;
        }
        const lIndent = l.length - l.trimStart().length;
        const lTrim = l.trim();
        if (lIndent !== nextIndent || !(lTrim.startsWith("- ") || lTrim === "-")) break;
        items.push(unquote(lTrim === "-" ? "" : lTrim.slice(2)));
        i++;
      }
      result[key] = items;
      continue;
    }

    if (nextIndent > indent) {
      const mapping: Record<string, unknown> = {};
      i = j;
      while (i < rawLines.length) {
        const l = rawLines[i];
        if (l.trim() === "") {
          i++;
          continue;
        }
        const lIndent = l.length - l.trimStart().length;
        if (lIndent !== nextIndent) break;
        const lTrim = l.trim();
        const ci = lTrim.indexOf(":");
        if (ci === -1) break;
        const k = lTrim.slice(0, ci).trim();
        const v = lTrim.slice(ci + 1).trim();
        mapping[k] = unquote(v);
        i++;
      }
      result[key] = mapping;
      continue;
    }

    result[key] = {};
  }

  return result;
}
