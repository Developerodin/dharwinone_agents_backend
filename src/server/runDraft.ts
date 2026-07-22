/** Build-lane draft helpers — port of studio/draft.py variant writers. */
import fs from "node:fs";
import path from "node:path";
import {
  applyPack,
  DEFAULT_TAGLINES,
  designLabel,
  pickTemplate,
  STYLE_PACKS,
  templateFiles,
  TEMPLATES_DIR,
  type StylePack,
} from "./draft";
import { atomicWriteJson } from "./packets";

const STOPWORDS = new Set(
  "build create make design want need a an the for me my our new simple one page single website site web landing homepage home online modern beautiful nice cool please and with of to that can you company business called named which who operates operating based located in at".split(
    " ",
  ),
);
const CLAUSE_BREAK = new Set("which that who in for and with operates operating based located".split(" "));

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function brandFromPrompt(prompt: string): string {
  const named = /\b(?:called|named)\s+(.{1,40})/i.exec(prompt);
  if (named) {
    const words: string[] = [];
    for (const w of named[1]!.match(/[A-Za-z0-9&]+/g) ?? []) {
      if (CLAUSE_BREAK.has(w.toLowerCase()) || words.length === 2) break;
      words.push(w);
    }
    if (words.length) return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }
  const words = (prompt.match(/[A-Za-z]+/g) ?? []).filter((w) => !STOPWORDS.has(w.toLowerCase()));
  if (!words.length) return "Your Brand";
  return words
    .slice(0, 3)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function taglineFromPrompt(prompt: string, template: string): string {
  let text = prompt.replace(/\b(?:called|named)\s+[A-Za-z0-9&]+\s*/gi, "");
  text = text.replace(/\b(?:which|that)\s+operates\b/gi, "operating");
  const words = text.split(/\s+/);
  const lead = new Set([
    "build",
    "create",
    "make",
    "design",
    "i",
    "want",
    "need",
    "a",
    "an",
    "the",
    "me",
    "my",
    "please",
    "website",
    "site",
    "web",
    "page",
    "landing",
    "homepage",
    "for",
    "one",
    "new",
    "simple",
    "modern",
  ]);
  while (words.length && lead.has(words[0]!.toLowerCase().replace(/[.,]/g, ""))) words.shift();
  let rest = words.join(" ").trim().replace(/[ .,]+$/, "");
  if (rest.split(/\s+/).length < 3) return DEFAULT_TAGLINES[template] ?? DEFAULT_TAGLINES.generic!;
  rest = rest.replace(/(?<=\bin )([a-z].*)$/i, (_, tail: string) =>
    tail.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/ And /g, " and "),
  );
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

function fillHtml(html: string, prompt: string, template: string): string {
  const brand = escapeHtml(brandFromPrompt(prompt));
  const tagline = escapeHtml(taglineFromPrompt(prompt, template));
  return html.replace(/\{\{BRAND\}\}/g, brand).replace(/\{\{TAGLINE\}\}/g, tagline);
}

export type DraftVariant = { id: string; label: string; html: string };

export function makeVariants(prompt: string): [string, DraftVariant[]] {
  const name = pickTemplate(prompt);
  const designs: DraftVariant[] = [];
  for (const fname of templateFiles(name)) {
    const stem = fname.slice(0, -".html".length);
    const raw = fs.readFileSync(path.join(TEMPLATES_DIR, fname), "utf-8");
    designs.push({ id: stem, label: designLabel(raw, stem, name), html: fillHtml(raw, prompt, name) });
  }
  const packs: DraftVariant[] = STYLE_PACKS.filter((p) => p.accent).map((p: StylePack) => ({
    id: p.id,
    label: p.label,
    html: applyPack(designs[0]!.html, p),
  }));
  return [name, [...designs, ...packs]];
}

export function writeVariants(runDir: string, variants: DraftVariant[]): void {
  variants.forEach((v, i) => {
    fs.writeFileSync(path.join(runDir, `draft-${i}.html`), v.html, "utf-8");
  });
}

export function writeDraft(runDir: string, html: string): string {
  const p = path.join(runDir, "draft.html");
  fs.writeFileSync(p, html, "utf-8");
  return p;
}

export function readChoice(runDir: string): Record<string, unknown> | null {
  const p = path.join(runDir, "draft-choice.json");
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, unknown>;
}

export { atomicWriteJson };
