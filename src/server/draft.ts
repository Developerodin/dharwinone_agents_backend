/** Port of studio/draft.py helpers used by personalization/composition. */

import fs from "node:fs";
import path from "node:path";
import { backendPath } from "./paths";
import type { Provider } from "./providers";

const SCRIPT_TAG_RE = /<script\b[^>]*>[\s\S]*?(<\/script\s*>|$)/gi;
const EVENT_ATTR_RE = /\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JAVASCRIPT_URI_RE = /javascript\s*:/gi;
const HEAD_RE = /(<head\b[^>]*>)([\s\S]*?)(<\/head>)/i;
const STYLE_TAG_RE = /<style\b[^>]*>[\s\S]*?<\/style>/gi;
const STYLESHEET_LINK_RE = /<link\b(?=[^>]*\brel\s*=\s*["']stylesheet["'])[^>]*>/gi;
const FONT_LINK_RE = /<link\b(?=[^>]*(?:fonts\.googleapis|fonts\.gstatic|preconnect))[^>]*>/gi;
const VISUAL_STYLE_HINT_RE =
  /\b(font|typography|style|styling|theme|palette|color|colour|redesign|restyle|look and feel|visual|appearance|dark mode|light mode|modern|minimal|brutalist|spacing|layout|make it look|change the design)\b/i;
const STYLE_RESET_HINT_RE =
  /\b(original font|old font|keep original font|use original font|revert font|restore font|restore original style|reset style|same style|as before|undo style|revert style)\b/i;

function stripMarkdownFences(text: string): string {
  let out = text.trim();
  out = out.replace(/^```(?:html|htm|xml|json)?\s*\r?\n?/i, "").replace(/\r?\n?```\s*$/i, "");
  return out.trim();
}

export function sanitizeHtml(html: string): string {
  let out = stripMarkdownFences(html);
  out = out.replace(SCRIPT_TAG_RE, "");
  out = out.replace(EVENT_ATTR_RE, "");
  out = out.replace(JAVASCRIPT_URI_RE, "");
  return out;
}

export function pickTemplate(hint: string): string {
  const low = hint.toLowerCase();
  if (/cafe|coffee|restaurant|food/.test(low)) return "cafe";
  if (/fitness|gym|workout/.test(low)) return "fitness";
  if (/medical|clinic|health/.test(low)) return "medical";
  if (/portfolio|photography/.test(low)) return "portfolio";
  if (/agency|marketing/.test(low)) return "agency";
  if (/saas|software|app/.test(low)) return "saas";
  if (/shop|store|e-?commerce/.test(low)) return "shop";
  return "generic";
}

export function extractHtmlDocument(out: unknown): string | null {
  if (typeof out !== "string") return null;
  const text = stripMarkdownFences(out);
  const low = text.toLowerCase();
  let start = low.indexOf("<!doctype");
  if (start === -1) start = low.indexOf("<html");
  const end = low.lastIndexOf("</html>");
  if (start === -1 || end === -1 || end < start) return null;
  return text.slice(start, end + "</html>".length);
}

export function extractHtmlFragment(out: unknown): string | null {
  if (typeof out !== "string") return null;
  const text = stripMarkdownFences(out);
  const low = text.toLowerCase();
  if (low.includes("<html") || low.includes("<!doctype")) return null;
  const trimmed = text.trim();
  return trimmed || null;
}

function extractStyleAssets(html: string): string[] {
  const matches: Array<[number, string]> = [];
  for (const pattern of [FONT_LINK_RE, STYLESHEET_LINK_RE, STYLE_TAG_RE]) {
    for (const m of html.matchAll(pattern)) matches.push([m.index ?? 0, m[0]]);
  }
  matches.sort((a, b) => a[0] - b[0]);
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const [, item] of matches) {
    if (seen.has(item)) continue;
    deduped.push(item);
    seen.add(item);
  }
  return deduped;
}

function styleCssBytes(html: string): number {
  let total = 0;
  for (const m of html.matchAll(STYLE_TAG_RE)) total += m[0].length;
  return total;
}

export function lostStyleSystem(originalHtml: string, editedHtml: string): boolean {
  const original = styleCssBytes(originalHtml);
  return original > 0 && styleCssBytes(editedHtml) < original * 0.6;
}

export function preserveStyleSystem(originalHtml: string, editedHtml: string): string {
  const m = HEAD_RE.exec(editedHtml);
  if (!m) return editedHtml;
  const styleAssets = extractStyleAssets(originalHtml);
  if (!styleAssets.length) return editedHtml;

  const matchStart = m.index!;
  const openTag = m[1]!;
  const innerRaw = m[2]!;
  const openEnd = matchStart + openTag.length;
  const innerEnd = openEnd + innerRaw.length;
  const closeEnd = innerEnd + m[3]!.length;

  let body = editedHtml.slice(closeEnd);
  for (const pattern of [STYLE_TAG_RE, STYLESHEET_LINK_RE, FONT_LINK_RE]) {
    body = body.replace(pattern, "");
  }
  let editedInner = innerRaw;
  for (const pattern of [STYLE_TAG_RE, STYLESHEET_LINK_RE, FONT_LINK_RE]) {
    editedInner = editedInner.replace(pattern, "");
  }
  const mergedInner = `${editedInner.replace(/\s+$/, "")}\n${styleAssets.join("\n")}\n`;
  return editedHtml.slice(0, openEnd) + mergedInner + editedHtml.slice(innerEnd, closeEnd) + body;
}

const REFINE_PROMPT_LOCKED = (prompt: string, html: string): string =>
  `You are editing a static website HTML document.\n\nUser request:\n${prompt}\n\nRules:\n` +
  `- You MAY add, remove, reorder, and rewrite sections to satisfy the request.\n` +
  `- Keep this a static site (HTML + CSS only). Never add JavaScript behavior.\n` +
  `- Never add <script> tags, inline event handlers, or javascript: URLs.\n` +
  `- Preserve valid HTML structure.\n` +
  `- Keep the existing visual style system exactly as-is.\n` +
  `- Output the complete HTML document and nothing else.\n\nCurrent document:\n${html}`;

const REFINE_PROMPT_STYLE = (prompt: string, html: string): string =>
  `You are editing a static website HTML document.\n\nUser request:\n${prompt}\n\nRules:\n` +
  `- You MAY adjust visual styling because the user explicitly asked for style/theme/design changes.\n` +
  `- Keep this a static site (HTML + CSS only). Never add JavaScript behavior.\n` +
  `- Output the complete HTML document and nothing else.\n\nCurrent document:\n${html}`;

export interface RefineOptions {
  styleReferenceHtml?: string | null;
}

export async function refine(
  provider: Provider,
  model: string,
  workingHtml: string,
  userPrompt: string,
  options: RefineOptions = {},
): Promise<string | null> {
  const { styleReferenceHtml = null } = options;
  const resetRequested = STYLE_RESET_HINT_RE.test(userPrompt);
  const styleRequested = VISUAL_STYLE_HINT_RE.test(userPrompt);
  const promptFn = resetRequested || !styleRequested ? REFINE_PROMPT_LOCKED : REFINE_PROMPT_STYLE;
  const out = await provider.generate(model, promptFn(userPrompt, workingHtml), { numCtx: 32768 });
  const html = extractHtmlDocument(out);
  if (!html) return null;
  let sanitized = sanitizeHtml(html);
  if (resetRequested) sanitized = preserveStyleSystem(styleReferenceHtml || workingHtml, sanitized);
  else if (!styleRequested || lostStyleSystem(workingHtml, sanitized)) {
    sanitized = preserveStyleSystem(workingHtml, sanitized);
  }
  return sanitized;
}

export interface RewriteSectionOptions {
  styleReferenceHtml?: string | null;
  numCtx?: number;
}

export async function rewriteSection(
  provider: Provider,
  model: string,
  sectionHtml: string,
  sectionType: string,
  userPrompt: string,
  options: RewriteSectionOptions = {},
): Promise<string | null> {
  const { styleReferenceHtml = null, numCtx = 8192 } = options;
  let styleBlock = "";
  if (styleReferenceHtml) {
    styleBlock =
      "Surrounding page context (preserve visual language; do not copy verbatim):\n" +
      `${styleReferenceHtml.slice(0, 4000)}\n`;
  }
  const prompt =
    `You are rewriting the INNER HTML of one website section.\n\nSection type: ${sectionType}\n\n` +
    `User intent:\n${userPrompt}\n\nRules:\n` +
    `- Output ONLY the inner HTML for this section.\n` +
    `- Never add <script>, inline event handlers, or javascript: URLs.\n\n` +
    `${styleBlock}Current section inner HTML:\n${sectionHtml}`;
  const out = await provider.generate(model, prompt, { numCtx });
  const fragment = extractHtmlFragment(out);
  return fragment ? sanitizeHtml(fragment) : null;
}

export const TEMPLATES_DIR = backendPath("assets/templates");

export const DEFAULT_TAGLINES: Record<string, string> = {
  cafe: "Small-batch roasts, fresh mornings, and a room worth staying in.",
  shop: "New drops, fair prices, free returns.",
  portfolio: "Selected work and commissions.",
  saas: "Less busywork. More momentum.",
  fitness: "Programs that meet you where you are.",
  agency: "Senior work, measured outcomes.",
  construction: "On time, on spec, on budget.",
  medical: "Care that starts with listening.",
  education: "Learn from people who teach for a living.",
  travel: "Trips planned by people who have been there.",
  generic: "What we do, and why it works.",
};

export interface StylePack {
  id: string;
  label: string;
  css?: string;
  accent?: string;
  ink?: string;
  muted?: string;
  bg?: string;
  surface?: string;
  font?: string;
}

// ponytail: superset CSS var overrides beats per-template theming contracts
export const STYLE_PACKS: StylePack[] = [
  { id: "original", label: "Original", css: "" },
  {
    id: "sleek-dark",
    label: "Sleek Dark",
    accent: "#4f7cff",
    ink: "#e8eaf2",
    muted: "#9aa1b5",
    bg: "#0e1016",
    surface: "#161a24",
    font: "'Inter',sans-serif",
  },
  {
    id: "minimal-light",
    label: "Minimal Light",
    accent: "#111111",
    ink: "#1a1a1a",
    muted: "#6f6f6f",
    bg: "#ffffff",
    surface: "#f5f4f1",
    font: "'Inter',sans-serif",
  },
  {
    id: "bold-pop",
    label: "Bold Pop",
    accent: "#ff3d67",
    ink: "#14121f",
    muted: "#5c5872",
    bg: "#fff7e8",
    surface: "#ffffff",
    font: "'Space Grotesk',sans-serif",
  },
  {
    id: "frosted",
    label: "Frosted Glass",
    accent: "#5a8fe6",
    ink: "#1c2434",
    muted: "#68738a",
    bg: "#eef2f8",
    surface: "#ffffff",
    font: "'Inter',sans-serif",
  },
  {
    id: "luxe-serif",
    label: "Luxe Serif",
    accent: "#1f3d2b",
    ink: "#20241f",
    muted: "#6b7265",
    bg: "#f7f4ec",
    surface: "#ffffff",
    font: "'Playfair Display',Georgia,serif",
  },
  {
    id: "high-contrast",
    label: "High Contrast",
    accent: "#ffd400",
    ink: "#000000",
    muted: "#444444",
    bg: "#ffffff",
    surface: "#f2f2f2",
    font: "'Archivo',sans-serif",
  },
  {
    id: "ocean-calm",
    label: "Ocean Calm",
    accent: "#0e7c86",
    ink: "#12303a",
    muted: "#5e7c85",
    bg: "#f2fbfa",
    surface: "#ffffff",
    font: "'Sora',sans-serif",
  },
];

const PACK_CSS = `
<style id="style-pack" data-pack="{id}">
:root {
  --accent:{accent}; --pop:{accent}; --volt:{accent}; --gold:{accent};
  --brand:{accent};
  --ink:{ink}; --dim:{muted};
  --bg:{bg}; --cream:{bg}; --paper:{bg}; --soft:{surface}; --line:{surface};
}
body { background:{bg} !important; color:{ink} !important; }
h1,h2,h3 { font-family:{font} !important; }
.bg-white,.card-soft,.menu-card,.product,.feature,.service,.plan {
  background:{surface} !important; color:{ink} !important;
}
.text-muted,.text-secondary,.text-white-50 { color:{muted} !important; }
.btn-primary,.btn-accent,.btn-pop,.btn-volt,.btn-brand,.btn-ink {
  background:{accent} !important; border-color:{accent} !important;
  color:{bg} !important;
}
footer { background:{surface} !important; color:{muted} !important; }
</style>
`;

const PACK_BLOCK_RE = /<style id="style-pack"[\s\S]*?<\/style>\s*/gi;
const LABEL_RE = /name="design-label"\s+content="([^"]+)"/;

export function templateFiles(name: string): string[] {
  const rx = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(-\\d+)?\\.html$`);
  return fs
    .readdirSync(TEMPLATES_DIR)
    .filter((f) => rx.test(f))
    .sort((a, b) => (a !== `${name}.html` ? 1 : 0) - (b !== `${name}.html` ? 1 : 0) || a.localeCompare(b));
}

export function designLabel(raw: string, stem: string, base: string): string {
  const m = LABEL_RE.exec(raw);
  if (m) return m[1]!;
  return stem === base ? "Classic" : stem.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function applyPack(html: string, pack: StylePack): string {
  let out = html.replace(PACK_BLOCK_RE, "");
  if (!pack.accent) return out;
  const css = PACK_CSS.replace(/\{id\}/g, pack.id)
    .replace(/\{accent\}/g, pack.accent!)
    .replace(/\{ink\}/g, pack.ink!)
    .replace(/\{muted\}/g, pack.muted!)
    .replace(/\{bg\}/g, pack.bg!)
    .replace(/\{surface\}/g, pack.surface!)
    .replace(/\{font\}/g, pack.font!);
  return out.replace("</head>", `${css}</head>`);
}

const IMG_OK_RE = /^https?:\/\//i;

export function ensureLoadableImages(html: string, _genre = "generic"): string {
  let slot = 0;
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const srcM = tag.match(/\bsrc=(["'])([^"']*)\1/i);
    let src = srcM?.[2] ?? "";
    if (!src || !IMG_OK_RE.test(src.trim())) {
      slot += 1;
      src = `https://placehold.co/800x600?text=Image+${slot}`;
    }
    let fixed = tag.replace(/\bsrc=(["'])[^"']*\1/i, `src="${src}"`);
    if (!/referrerpolicy=/i.test(fixed)) {
      fixed = fixed.replace(/\/?>$/, ' referrerpolicy="no-referrer">');
    }
    return fixed;
  });
}

export function normalizeCtaAnchors(html: string): string {
  const ids = [...html.matchAll(/\bid="([A-Za-z][\w-]*)"/g)].map((m) => m[1]!);
  if (!ids.length) return html;
  const idSet = new Set(ids);
  const contact = ["contact", "visit"].find((i) => idSet.has(i)) ?? null;
  const menu = ["menu", "list", "board", "bakes"].find((i) => idSet.has(i)) ?? null;
  const about =
    ["about", "story", "ritual", "process", "why", "method"].find((i) => idSet.has(i)) ?? null;
  const primary = menu || about || ids.find((i) => !["top", "contact", "visit"].includes(i)) || ids[0]!;
  const secondary = about || contact || primary;
  let out = html;
  if (idSet.has("top")) {
    out = out.replace(
      /(<a\b[^>]*class="[^"]*\bbrand\b[^"]*"[^>]*\b)href="#"/i,
      '$1href="#top"',
    );
  }
  let btnIdx = 0;
  out = out.replace(/(<a\b[^>]*\bclass="[^"]*\bbtn[^"]*"[^>]*\b)href="#"/gi, (match) => {
    const target = btnIdx === 0 ? primary : secondary;
    btnIdx += 1;
    return `${match}href="#${target}"`;
  });
  return out;
}
