import fs from "node:fs";
import path from "node:path";
import {
  applyPack,
  DEFAULT_TAGLINES,
  designLabel,
  ensureLoadableImages,
  normalizeCtaAnchors,
  pickTemplate,
  sanitizeHtml,
  STYLE_PACKS,
  templateFiles,
  TEMPLATES_DIR,
  type StylePack,
} from "../draft";
import { businessFacts } from "../profileFacts";
import * as assetsRepo from "../repos/assetsRepo";
import * as profilesRepo from "../repos/profilesRepo";
import * as projectsRepo from "../repos/projectsRepo";
import * as templatesRepo from "../repos/templatesRepo";
import { publicAssetUrl } from "../storage/s3";
import { isMultiPlaceValue, splitMultiPlaceValue } from "./profileService";
import * as compositionService from "./compositionService";

export class PersonalizationError extends Error {}

const PLACEHOLDER_RE = /\{\{[^}]+\}\}/;
const EMAIL_TEXT_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_TEXT_RE = /\+?\d[\d\s().-]{7,}\d/g;
const TAG_SPLIT_RE =
  /(<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>|<[^>]*>)/gi;
const MAX_PACKS = 2;

const STYLE_PREF_PACK_KEYWORDS: Record<string, string[]> = {
  "sleek-dark": ["sleek", "dark", "night", "moody"],
  "minimal-light": ["minimal", "clean", "simple", "light"],
  "bold-pop": ["bold", "pop", "vibrant", "neon", "colorful"],
  frosted: ["glass", "frosted", "blur", "translucent"],
  "luxe-serif": ["luxe", "luxury", "premium", "elegant", "serif"],
  "high-contrast": ["high contrast", "contrast", "accessible"],
  "ocean-calm": ["ocean", "calm", "teal", "coastal", "aqua"],
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function brand(profile: Record<string, unknown>): string {
  const name = (profile.brand as Record<string, unknown> | undefined)?.brandName;
  return escapeHtml(String(name || "Your Brand"));
}

function brandSlug(profile: Record<string, unknown>): string {
  const brandName = String((profile.brand as Record<string, unknown> | undefined)?.brandName ?? "");
  const base = brandName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base || "yourbrand";
}

function tagline(profile: Record<string, unknown>, genre: string): string {
  const business = (profile.business as Record<string, unknown> | undefined) ?? {};
  if (business.description) return escapeHtml(String(business.description));
  const services = Array.isArray(business.services) ? business.services : [];
  const btype = String(business.type ?? "We");
  if (services.length) {
    return escapeHtml(`${btype} — ${services.slice(0, 3).join(", ")}.`);
  }
  return escapeHtml(DEFAULT_TAGLINES[genre] ?? DEFAULT_TAGLINES.generic!);
}

function locationDisplayText(profile: Record<string, unknown>): string {
  const location = (profile.location as Record<string, unknown> | undefined) ?? {};
  const country = String(location.country ?? "").trim();
  const city = String(location.city ?? "").trim();
  const street = String(location.address ?? "").trim();
  if (country && isMultiPlaceValue(country)) {
    return `We work in many countries — ${splitMultiPlaceValue(country).join(", ")}`;
  }
  if (city && isMultiPlaceValue(city)) {
    return `Serving ${splitMultiPlaceValue(city).join(", ")}`;
  }
  if (street && city) return [street, city].join(", ");
  if (city) return city;
  if (country) return country;
  return "Your city";
}

function subVisibleText(html: string, pattern: RegExp, repl: string): string {
  const parts = html.split(TAG_SPLIT_RE);
  for (let i = 0; i < parts.length; i += 2) {
    parts[i] = parts[i]!.replace(pattern, () => repl);
  }
  return parts.join("");
}

function applyContact(html: string, profile: Record<string, unknown>): string {
  const contact = (profile.contact as Record<string, unknown> | undefined) ?? {};
  const rawEmail = String(contact.email ?? "").trim() || `hello@${brandSlug(profile)}.site`;
  const rawPhone = String(contact.phone ?? "").trim() || "Add your phone number";
  const email = escapeHtml(rawEmail);
  const phone = escapeHtml(rawPhone);
  let phoneHref = rawPhone.replace(/\D/g, "");
  if (phoneHref && rawPhone.startsWith("+")) phoneHref = `+${phoneHref}`;
  phoneHref = escapeHtml(phoneHref);
  const address = escapeHtml(locationDisplayText(profile));

  let out = html
    .replace(/\bAdd your number here\b/gi, phone)
    .replace(/\bAdd your phone number\b/gi, phone)
    .replace(/\bAdd your phone\b/gi, phone)
    .replace(/hello@yourdomain\.com/gi, email)
    .replace(/hello@[A-Za-z0-9.-]+\.example/gi, email)
    .replace(/hello@example\.com/gi, email)
    .replace(/Your street, your city/g, address);
  out = subVisibleText(out, EMAIL_TEXT_RE, email);
  out = subVisibleText(out, PHONE_TEXT_RE, phone);
  out = out.replace(/(href\s*=\s*["'])mailto:[^"']+(["'])/gi, `$1mailto:${email}$2`);
  if (phoneHref) out = out.replace(/(href\s*=\s*["'])tel:[^"']*(["'])/gi, `$1tel:${phoneHref}$2`);

  const lower = out.toLowerCase();
  const hasEmail = lower.includes(email.toLowerCase()) || lower.includes(`mailto:${email.toLowerCase()}`);
  const hasPhone =
    lower.includes(phone.toLowerCase()) || (Boolean(phoneHref) && lower.includes(`tel:${phoneHref.toLowerCase()}`));
  if (hasEmail && hasPhone) return out;

  const phoneLine = phoneHref
    ? `<a href="tel:${phoneHref}" style="color:var(--accent,#0d6efd);">${phone}</a>`
    : phone;
  const section =
    '<section id="contact" data-section="contact" class="builder-contact" ' +
    'style="padding:64px 24px;background:var(--bg,#fff);color:var(--ink,#111);' +
    'border-top:1px solid var(--line,#e5e7eb);font:inherit;">' +
    '<div class="container" style="max-width:1140px;margin:0 auto;">' +
    '<h2 style="margin:0 0 16px;color:inherit;font-size:1.75rem;">Contact</h2>' +
    `<p style="margin:0 0 8px;color:inherit;">Email: <a href="mailto:${email}" style="color:var(--accent,#0d6efd);">${email}</a></p>` +
    `<p style="margin:0 0 8px;color:inherit;">Phone: ${phoneLine}</p>` +
    `<p style="margin:0;color:inherit;">Location: ${address}</p></div></section>`;
  if (/<footer\b/i.test(out)) return out.replace(/<footer\b/i, `${section}<footer`);
  if (/<\/body>/i.test(out)) return out.replace(/<\/body>/i, `${section}</body>`);
  return `${out}${section}`;
}

function applyServices(html: string, profile: Record<string, unknown>): string {
  const services = ((profile.business as Record<string, unknown> | undefined)?.services as string[]) ?? [];
  let out = html;
  for (const service of services.slice(0, 3)) {
    const safe = escapeHtml(service);
    out = out.replace("Your main offering", safe);
    out = out.replace("Your second strength", safe);
    out = out.replace("The specialist request", safe);
  }
  const audience = (profile.business as Record<string, unknown> | undefined)?.targetAudience;
  if (audience) out = out.replace("people nearby", escapeHtml(String(audience)));
  return out;
}

function logoUrl(assets: Record<string, unknown>[]): string | null {
  for (const asset of assets) {
    if (asset.assetType === "logo" && asset.status === "ready" && asset.s3Key) {
      return publicAssetUrl(String(asset.s3Key));
    }
  }
  return null;
}

function applyLogo(html: string, assets: Record<string, unknown>[]): string {
  const logo = logoUrl(assets);
  if (!logo) return html;
  const safe = escapeHtml(logo);
  if (html.includes("<img")) {
    return html.replace(/(<img[^>]+src=")[^"]+(")/, `$1${safe}$2`);
  }
  return html.replace(
    '<a class="brand"',
    `<img src="${safe}" alt="logo" style="height:32px;margin-right:8px;" /><a class="brand"`,
  );
}

export function personalizeHtml(
  rawHtml: string,
  profile: Record<string, unknown>,
  assets: Record<string, unknown>[],
  genre: string,
): string {
  let html = rawHtml.replace(/\{\{BRAND\}\}/g, brand(profile));
  html = html.replace(/\{\{TAGLINE\}\}/g, tagline(profile, genre));
  html = applyContact(html, profile);
  html = applyServices(html, profile);
  html = applyLogo(html, assets);
  html = ensureLoadableImages(html, genre);
  if (PLACEHOLDER_RE.test(html)) throw new PersonalizationError("unresolved template placeholders remain");
  html = normalizeCtaAnchors(html);
  return sanitizeHtml(html);
}

function genreHint(project: Record<string, unknown>, profile: Record<string, unknown>): string {
  const prompt = String(project.initialPrompt ?? "");
  const business = (profile.business as Record<string, unknown> | undefined) ?? {};
  const parts = [
    prompt,
    String(business.type ?? ""),
    Array.isArray(business.services) ? business.services.join(" ") : "",
    String(business.targetAudience ?? ""),
  ].filter(Boolean);
  return parts.join(" ").trim() || "generic website";
}

function persistKey(projectId: string, templateId: string): string {
  return `projects/${projectId}/templates/${templateId}.html`;
}

function preferredPackIds(profile: Record<string, unknown>): string[] {
  const pref = String(((profile.design as Record<string, unknown> | undefined)?.stylePreference ?? "")).toLowerCase();
  if (!pref) return [];
  const scored: Array<[number, number, string]> = [];
  for (let idx = 0; idx < STYLE_PACKS.length - 1; idx++) {
    const pack = STYLE_PACKS[idx + 1]!;
    const keywords = STYLE_PREF_PACK_KEYWORDS[pack.id] ?? [];
    const score = keywords.filter((kw) => pref.includes(kw)).length;
    if (score) scored.push([-score, idx, pack.id]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return scored.map(([, , pid]) => pid);
}

function selectedStylePacks(profile: Record<string, unknown>): StylePack[] {
  const selected: StylePack[] = [];
  const byId = Object.fromEntries(STYLE_PACKS.slice(1).map((p) => [p.id, p]));
  for (const pid of preferredPackIds(profile)) {
    const pack = byId[pid];
    if (pack && !selected.includes(pack)) selected.push(pack);
    if (selected.length >= MAX_PACKS) return selected;
  }
  for (const pack of STYLE_PACKS.slice(1)) {
    if (!selected.includes(pack)) selected.push(pack);
    if (selected.length >= MAX_PACKS) break;
  }
  return selected;
}

function composedCount(): number {
  const raw = process.env.STUDIO_COMPOSED_VARIANTS ?? "2";
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(n, 3)) : 2;
}

async function composedTemplates(
  projectId: string,
  profile: Record<string, unknown>,
  assets: Record<string, unknown>[],
  genre: string,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  try {
    const composed = await compositionService.composeProjectVariants(
      projectId,
      businessFacts(profile),
      genre,
      composedCount(),
    );
    for (let idx = 0; idx < composed.length; idx++) {
      const comp = composed[idx]!;
      try {
        const html = personalizeHtml(comp.html, profile, assets, genre);
        out.push({
          templateId: `composed-${idx + 1}`,
          label: `Composed ${idx + 1} · ${genre.charAt(0).toUpperCase()}${genre.slice(1)}`,
          style: genre,
          sourceTemplateRef: comp.componentIds.join(","),
          s3HtmlKey: persistKey(projectId, `composed-${idx + 1}`),
          htmlContent: html,
        });
      } catch (exc) {
        if (exc instanceof PersonalizationError) continue;
        throw exc;
      }
    }
  } catch {
    /* composed variants optional */
  }
  return out;
}

export async function generateForProject(
  projectId: string,
  force = false,
): Promise<Record<string, unknown>[]> {
  const project = await projectsRepo.get(projectId);
  if (!project) throw new Error("project not found");
  const existing = await templatesRepo.listForProject(projectId);
  if (existing.length && !force) return existing;

  const profile = await profilesRepo.get(projectId);
  const assets = await assetsRepo.listForProject(projectId);
  const genre = pickTemplate(genreHint(project, profile));
  const templates: Record<string, unknown>[] = [];

  const composed = await composedTemplates(projectId, profile, assets, genre);
  if (composed.length) {
    for (let i = 0; i < composed.length; i++) {
      templates.push({ ...composed[i]!, sourceKind: "composed", galleryIndex: i });
    }
    const baseHtml = String(composed[0]!.htmlContent);
    for (let j = 0; j < selectedStylePacks(profile).length; j++) {
      const pack = selectedStylePacks(profile)[j]!;
      const packed = applyPack(baseHtml, pack);
      if (PLACEHOLDER_RE.test(packed)) throw new PersonalizationError("unresolved placeholders in style pack");
      const templateId = `${genre}-${pack.id}`;
      templates.push({
        templateId,
        label: `${pack.label} · ${genre.charAt(0).toUpperCase()}${genre.slice(1)}`,
        style: genre,
        sourceTemplateRef: composed[0]!.sourceTemplateRef,
        s3HtmlKey: persistKey(projectId, templateId),
        htmlContent: packed,
        sourceKind: "pack",
        galleryIndex: composed.length + j,
      });
    }
  } else {
    const designFiles = templateFiles(genre);
    if (designFiles.length) {
      const fname = designFiles[0]!;
      const stem = fname.slice(0, -".html".length);
      const raw = fs.readFileSync(path.join(TEMPLATES_DIR, fname), "utf8");
      const html = personalizeHtml(raw, profile, assets, genre);
      templates.push({
        templateId: stem,
        label: designLabel(raw, stem, genre),
        style: genre,
        sourceTemplateRef: fname,
        s3HtmlKey: persistKey(projectId, stem),
        htmlContent: html,
        sourceKind: "fallback",
        galleryIndex: 0,
      });
    }
  }

  templates.sort(
    (a, b) =>
      ((a.galleryIndex as number | undefined) ?? 999) - ((b.galleryIndex as number | undefined) ?? 999) ||
      String(a.templateId).localeCompare(String(b.templateId)),
  );

  const saved = await templatesRepo.replaceForProject(projectId, templates);
  await projectsRepo.updateFields(projectId, { status: "ready", templateCount: saved.length });
  return saved;
}
