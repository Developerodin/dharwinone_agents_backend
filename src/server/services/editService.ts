import { extractSectionInner, replaceSectionInner } from "../componentHtml";
import { refine, rewriteSection, sanitizeHtml } from "../draft";
import { loadEditProvider } from "../llmProvider";
import * as editsRepo from "../repos/editsRepo";
import * as profilesRepo from "../repos/profilesRepo";
import * as projectsRepo from "../repos/projectsRepo";
import * as templatesRepo from "../repos/templatesRepo";
import * as versionsRepo from "../repos/versionsRepo";
import * as workingHtmlRepo from "../repos/workingHtmlRepo";
import * as selectionService from "./selectionService";

export class EditValidationError extends Error {}

const TAGLINE_RE = /(<p class="tagline[^"]*"[^>]*>)([\s\S]*?)(<\/p>)/i;
const H1_RE = /(<h1[^>]*>)([\s\S]*?)(<\/h1>)/i;
const AMBIGUOUS_EDIT_RE =
  /\b(?:change|update|edit|fix)\b.*\b(?:this|it|site|website|page)\b/i;
const BRAND_ALIGN_RE = /\bmatch\b.*\bbrand\b/i;
const EXPLICIT_TARGET_RE =
  /\b(?:headline|tagline|title|hero|subheading|button|cta|nav|menu|footer|section|font|color|logo)\b/i;
const HAS_DIRECTIVE_RE = /\b(?:change|replace|update|set)\b.+\bto\b.+/i;
const THEME_EDIT_RE =
  /\b(?:theme|palette|colou?r scheme|colou?rs|look and feel|vibe|dark mode|light mode|restyle|redesign)\b/i;
const THEME_TARGETED_RE =
  /"|\b(?:headline|tagline|subheading|text|copy|wording|word|image|photo|logo|section|paragraph)\b/i;

const SECTION_ALIASES: Record<string, string[]> = {
  hero: ["hero", "headline", "banner", "header"],
  nav: ["nav", "menu", "navigation"],
  footer: ["footer"],
  features: ["features", "benefits"],
  cta: ["call to action", "button", "cta"],
  testimonials: ["testimonials", "reviews", "quotes"],
  faq: ["faq", "questions"],
  pricing: ["pricing", "plans", "price"],
};

function htmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function needsClarification(prompt: string): boolean {
  const text = prompt.trim();
  if (!text) return true;
  const low = text.toLowerCase();
  if (low.startsWith("change tagline to ") || low.startsWith("change headline to ")) return false;
  if (HAS_DIRECTIVE_RE.test(text) && EXPLICIT_TARGET_RE.test(text)) return false;
  if (AMBIGUOUS_EDIT_RE.test(text)) return true;
  if (BRAND_ALIGN_RE.test(text) && !EXPLICIT_TARGET_RE.test(text)) return true;
  return false;
}

function isThemeRequest(prompt: string): boolean {
  const text = prompt.trim();
  return THEME_EDIT_RE.test(text) && !THEME_TARGETED_RE.test(text);
}

function clarificationMessage(): string {
  return (
    "Tell me exactly what to change. Examples: " +
    '1) Change hero headline to "Flutoi serves handcrafted coffee" ' +
    '2) Replace subheading under hero with "Fresh bakes daily in Jaipur" ' +
    '3) Update button text "See today\'s board" to "View menu".'
  );
}

function themeClarification(options: Array<Record<string, unknown>>): string {
  const base =
    "What look do you want? For example: dark, minimal and light, bold and playful, elegant/premium, high-contrast, or calm and natural.";
  if (!options.length) return base;
  const labels = [...new Set(options.map((t) => String(t.label ?? t.templateId)))].join(", ");
  return `${base} Or pick one of your ready designs: ${labels}.`;
}

async function selectedTemplateId(projectId: string): Promise<string | null> {
  const doc = await workingHtmlRepo.get(projectId);
  return (doc?.selectedTemplateId as string | null) ?? null;
}

async function selectedTemplateHtml(projectId: string): Promise<string | null> {
  const tid = await selectedTemplateId(projectId);
  if (!tid) return null;
  const doc = await templatesRepo.get(projectId, tid);
  return (doc?.htmlContent as string | null) ?? null;
}

function applyContentEdit(html: string, prompt: string): string | null {
  const text = prompt.trim();
  const low = text.toLowerCase();
  if (low.startsWith("change tagline to ")) {
    const value = htmlEscape(text.slice(18).trim().replace(/^"|"$/g, ""));
    if (TAGLINE_RE.test(html)) return html.replace(TAGLINE_RE, `$1${value}$3`);
  }
  if (low.startsWith("change headline to ")) {
    const value = htmlEscape(text.slice(19).trim().replace(/^"|"$/g, ""));
    if (H1_RE.test(html)) return html.replace(H1_RE, `$1${value}$3`);
  }
  return null;
}

function applyStructuralEdit(html: string, prompt: string): string {
  const section = htmlEscape(prompt.trim().slice(0, 120) || "New section");
  const block =
    `<section class="builder-added"><h2>${section}</h2>` +
    `<p>Added via advanced structural edit.</p></section>`;
  return html.replace("</body>", `${block}</body>`);
}

function identifySections(prompt: string): string | null {
  const text = prompt.toLowerCase();
  const hits: string[] = [];
  for (const [sectionType, keywords] of Object.entries(SECTION_ALIASES)) {
    if (keywords.some((kw) => text.includes(kw))) hits.push(sectionType);
  }
  return hits.length === 1 ? hits[0]! : null;
}

async function applySectionEdit(
  projectId: string,
  html: string,
  prompt: string,
  sectionType: string,
): Promise<string | null> {
  const inner = extractSectionInner(html, sectionType);
  if (!inner) return null;
  const [provider, model] = loadEditProvider();
  if (!provider || !model) return null;
  const newInner = await rewriteSection(provider, model, inner, sectionType, prompt, {
    styleReferenceHtml: html,
    numCtx: 8192,
  });
  if (!newInner) return null;
  return sanitizeHtml(replaceSectionInner(html, sectionType, newInner));
}

async function applyLlmEdit(projectId: string, html: string, prompt: string): Promise<string | null> {
  const sectionType = identifySections(prompt);
  if (sectionType && html.includes(`data-section="${sectionType}"`)) {
    const edited = await applySectionEdit(projectId, html, prompt, sectionType);
    if (edited) return edited;
  }
  const [provider, model] = loadEditProvider();
  if (!provider || !model) return null;
  const styleRef = await selectedTemplateHtml(projectId);
  for (const candidate of [
    prompt,
    `Apply this website edit exactly and return the full updated HTML document only. User request: ${prompt}`,
  ]) {
    try {
      const edited = await refine(provider, model, html, candidate, { styleReferenceHtml: styleRef });
      if (edited) return edited;
    } catch {
      continue;
    }
  }
  return null;
}

function isChanged(before: string, after: string): boolean {
  return before.trim() !== after.trim();
}

async function applyLlmEditOrFail(projectId: string, html: string, prompt: string): Promise<string> {
  const edited = await applyLlmEdit(projectId, html, prompt);
  if (!edited) throw new EditValidationError("could not apply edit (model unavailable or invalid output)");
  if (!isChanged(html, edited)) throw new EditValidationError("edit produced no visible change");
  return edited;
}

async function themeOptions(projectId: string, currentId: string | null): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  for (const t of await templatesRepo.listForProject(projectId)) {
    const tid = t.templateId as string | undefined;
    if (tid && tid !== currentId && t.htmlContent) out.push(t);
  }
  return out;
}

async function applyThemeEdit(
  projectId: string,
  prompt: string,
  html: string,
): Promise<Record<string, unknown>> {
  // ponytail: LLM theme matching + pack recolor deferred; ask user to pick a design
  const currentId = await selectedTemplateId(projectId);
  const options = await themeOptions(projectId, currentId);
  const low = prompt.toLowerCase();
  for (const t of options) {
    const label = String(t.label ?? "").toLowerCase();
    const tid = String(t.templateId ?? "");
    if ((label && low.includes(label)) || (tid && low.includes(tid))) {
      const result = await selectionService.selectTemplate(projectId, tid);
      await editsRepo.append(projectId, {
        source: "ai",
        userPrompt: prompt,
        actionSummary: `Switched design to ${tid}`,
        changeScope: "theme",
        targets: ["working-html"],
      });
      return { html: result.html, changeScope: "theme", templateId: tid };
    }
  }
  throw new EditValidationError(themeClarification(options));
}

export async function saveManual(projectId: string, html: string): Promise<Record<string, unknown>> {
  const templateId = await selectedTemplateId(projectId);
  await workingHtmlRepo.put(projectId, html, templateId);
  const profile = await profilesRepo.get(projectId);
  const version = await versionsRepo.create(projectId, {
    label: "Manual save",
    trigger: "explicit_save",
    html: sanitizeHtml(html),
    profile,
  });
  await editsRepo.append(projectId, {
    source: "manual",
    userPrompt: "",
    actionSummary: "Manual code save",
    changeScope: "manual",
    targets: ["working-html"],
    versionId: version.versionId as string,
  });
  return { ok: true, versionId: version.versionId };
}

export async function applyEdit(
  projectId: string,
  prompt: string,
  structural = false,
): Promise<Record<string, unknown>> {
  if (!prompt.trim()) throw new EditValidationError("prompt required");
  const html = await workingHtmlRepo.requireHtml(projectId);
  if (!structural && isThemeRequest(prompt)) return applyThemeEdit(projectId, prompt, html);

  let updated: string;
  let scope: string;
  if (structural) {
    updated = applyStructuralEdit(html, prompt);
    scope = "structural";
  } else {
    if (needsClarification(prompt)) throw new EditValidationError(clarificationMessage());
    updated = applyContentEdit(html, prompt) ?? "";
    if (!updated || !isChanged(html, updated)) {
      updated = await applyLlmEditOrFail(projectId, html, prompt);
    }
    scope = "content";
  }

  updated = sanitizeHtml(updated);
  const templateId = await selectedTemplateId(projectId);
  await workingHtmlRepo.put(projectId, updated, templateId);
  const profile = await profilesRepo.get(projectId);
  let versionId: string | undefined;
  if (structural) {
    const version = await versionsRepo.create(projectId, {
      label: "Structural edit",
      trigger: "structural_edit",
      html: updated,
      profile,
    });
    versionId = version.versionId as string;
  }
  await editsRepo.append(projectId, {
    source: structural ? "ai_structural" : "ai",
    userPrompt: prompt,
    actionSummary: `Applied ${scope} edit`,
    changeScope: scope,
    targets: ["working-html"],
    versionId,
  });
  return { html: updated, changeScope: scope };
}
