/** Compose website variants from the extracted component library (port of composition_service.py). */

import fs from "node:fs";
import path from "node:path";
import { backendPath } from "../paths";
import { loadOnboardingProvider } from "../llmProvider";

const COMPONENTS_DIR = backendPath("studio/components");
const TEMPLATES_DIR = backendPath("studio/templates");

const RECIPE = [
  "nav",
  "hero",
  "features",
  "about",
  "gallery",
  "stats",
  "pricing",
  "testimonials",
  "faq",
  "cta",
  "contact",
  "footer",
] as const;
const REQUIRED = new Set(["nav", "hero", "footer"]);
const MAX_HTML_BYTES = 150 * 1024;

interface ComponentEntry {
  id: string;
  type: string;
  genre: string;
  tags: string[];
  path: string;
  fonts?: string[];
}

let indexCache: Record<string, ComponentEntry[]> | null = null;
const fileCache = new Map<string, string>();

const SHELL = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{BRAND}}</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
__FONTS__
<style>__BASE__</style>
<style>__PALETTE__</style>
</head>
<body>
__BODY__
</body>
</html>`;

const SELECT_PROMPT = `Pick the page design that best fits this small business.

Business genre: {genre}
Business:
{facts}

Page designs (JSON) — each is one complete, visually coherent page:
{designs}

Reply with only JSON naming ONE design, like {"design": "2"}.
Use only a design id listed above.`;

export class CompositionError extends Error {}

export function resetForTests(): void {
  indexCache = null;
  fileCache.clear();
}

function index(): Record<string, ComponentEntry[]> {
  if (indexCache) return indexCache;
  const raw = fs.readFileSync(path.join(COMPONENTS_DIR, "manifest.json"), "utf8");
  const entries = JSON.parse(raw) as ComponentEntry[];
  const idx: Record<string, ComponentEntry[]> = {};
  for (const entry of entries) {
    (idx[entry.type] ??= []).push(entry);
  }
  indexCache = idx;
  return idx;
}

function read(name: string): string {
  if (!fileCache.has(name)) {
    fileCache.set(name, fs.readFileSync(path.join(COMPONENTS_DIR, name), "utf8"));
  }
  return fileCache.get(name)!;
}

function family(entry: ComponentEntry): string {
  const parts = entry.id.split("-");
  return parts.length === 4 ? parts[1]! : "0";
}

function order(entry: ComponentEntry): number {
  const parts = entry.id.split("-");
  return parts.length === 4 ? parseInt(parts[2]!, 10) : parseInt(parts[1]!, 10);
}

function families(genre: string): Record<string, Record<string, ComponentEntry[]>> {
  const fams: Record<string, Record<string, ComponentEntry[]>> = {};
  for (const slot of RECIPE) {
    for (const entry of index()[slot] ?? []) {
      if (entry.genre !== genre) continue;
      const fam = family(entry);
      (fams[fam] ??= {})[slot] ??= [];
      fams[fam]![slot]!.push(entry);
    }
  }
  const out: Record<string, Record<string, ComponentEntry[]>> = {};
  for (const [fam, slots] of Object.entries(fams)) {
    if ([...REQUIRED].every((s) => slots[s])) out[fam] = slots;
  }
  return out;
}

const ROOT_RE = /:root\s*\{[\s\S]*?\}/;

function palette(entry: ComponentEntry): string {
  const fam = family(entry);
  const name = fam === "0" ? `${entry.genre}.html` : `${entry.genre}-${fam}.html`;
  if (!fileCache.has(name)) {
    try {
      const found = ROOT_RE.exec(fs.readFileSync(path.join(TEMPLATES_DIR, name), "utf8"));
      fileCache.set(name, found?.[0] ?? "");
    } catch {
      fileCache.set(name, "");
    }
  }
  return fileCache.get(name)!;
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededRandom(seed: string): { next: () => number; choice: <T>(items: T[]) => T } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  const rnd = mulberry32(h);
  return {
    next: rnd,
    choice: <T>(items: T[]) => items[Math.floor(rnd() * items.length)]!,
  };
}

function build(slots: Record<string, ComponentEntry[]>, rng: ReturnType<typeof seededRandom>): ComponentEntry[] {
  const chosen = RECIPE.filter((s) => slots[s]).map((s) => rng.choice(slots[s]!));
  return chosen.sort((a, b) => order(a) - order(b));
}

function pickDeterministic(projectId: string, genre: string, seed: number): ComponentEntry[] {
  const fams = families(genre);
  const keys = Object.keys(fams).sort();
  if (!keys.length) throw new CompositionError(`no complete ${genre} component family`);
  const rng = seededRandom(`${projectId}:${seed}`);
  return build(fams[rng.choice(keys)]!, rng);
}

async function pickLlm(
  genre: string,
  businessFacts: string,
  rng: ReturnType<typeof seededRandom>,
): Promise<ComponentEntry[] | null> {
  const [provider, model] = loadOnboardingProvider();
  if (!provider || !model) return null;
  const fams = families(genre);
  const keys = Object.keys(fams);
  if (!keys.length) return null;
  const designs: Record<string, unknown> = {};
  for (const f of keys) {
    const slots = fams[f]!;
    designs[f] = {
      sections: RECIPE.filter((s) => slots[s]),
      tags: [
        ...new Set(
          Object.values(slots)
            .flat()
            .flatMap((e) => e.tags)
            .filter((t) => t !== genre),
        ),
      ].sort(),
    };
  }
  const prompt = SELECT_PROMPT.replace("{genre}", genre)
    .replace("{facts}", businessFacts || "(no details provided)")
    .replace("{designs}", JSON.stringify(designs, null, 0));
  try {
    const out = await provider.generate(model, prompt, { numCtx: 8192, timeoutS: 30 });
    const raw = (out ?? "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
    const data = JSON.parse(raw) as { design?: string };
    const slots = fams[String(data.design ?? "")];
    if (!slots) return null;
    return build(slots, rng);
  } catch {
    return null;
  }
}

function assemble(entries: ComponentEntry[]): string {
  const fonts: string[] = [];
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const entry of entries) {
    parts.push(read(entry.path));
    for (const href of entry.fonts ?? []) {
      if (!seen.has(href)) {
        seen.add(href);
        fonts.push(`<link href="${href}" rel="stylesheet">`);
      }
    }
  }
  const html = SHELL.replace("__FONTS__", fonts.join("\n"))
    .replace("__BASE__", read("base.css"))
    .replace("__PALETTE__", palette(entries[0]!))
    .replace("__BODY__", parts.join("\n"));
  for (const slot of ["nav", "hero", "footer"] as const) {
    if (!html.includes(`data-section="${slot}"`)) {
      throw new CompositionError(`assembled html missing data-section=${slot}`);
    }
  }
  return html;
}

export interface ComposedVariant {
  html: string;
  componentIds: string[];
  via: string;
}

export async function composeProjectVariants(
  projectId: string,
  businessFacts: string,
  genre: string,
  count: number,
): Promise<ComposedVariant[]> {
  if (count <= 0) return [];
  const variants: ComposedVariant[] = [];
  for (let seed = 0; seed < count; seed++) {
    try {
      let entries: ComponentEntry[] | null = null;
      let via = "deterministic";
      if (seed === 0) {
        try {
          entries = await pickLlm(genre, businessFacts, seededRandom(`${projectId}:llm`));
        } catch {
          entries = null;
        }
        if (entries) via = "llm";
      }
      if (!entries) entries = pickDeterministic(projectId, genre, seed);
      const html = assemble(entries);
      if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
        throw new CompositionError("composed page exceeds 150KB budget");
      }
      variants.push({
        html,
        componentIds: entries.map((e) => e.id),
        via,
      });
    } catch {
      continue;
    }
  }
  return variants;
}
