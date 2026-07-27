/** HTML sanitize + refine helpers used by the runs edit pipeline. */

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
