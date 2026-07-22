/** Phase 1 site publish — checklist + atomic publish flip. */
import * as sitesRepo from "../repos/sitesRepo";
import * as imageResolver from "./imageResolverService";

export const RESERVED_SUBDOMAINS = new Set([
  "www",
  "api",
  "admin",
  "app",
  "mail",
  "smtp",
  "ftp",
  "staging",
  "dev",
  "preview",
  "static",
  "cdn",
  "assets",
  "support",
  "help",
  "billing",
  "pay",
  "login",
  "auth",
]);

export type ChecklistItem = { id: string; ok: boolean; message: string; warn?: boolean };

export function slugifySubdomain(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function contrastRatioStub(theme: Record<string, unknown>): { ok: boolean; message: string } {
  const brand = (theme.brand as Record<string, unknown> | undefined) ?? {};
  const primary = String(brand.primary_color ?? brand.primaryColor ?? "#111827");
  const background = String(brand.background_color ?? brand.backgroundColor ?? "#ffffff");
  if (primary.toLowerCase() === background.toLowerCase()) {
    return { ok: false, message: "Primary and background colors are identical (contrast stub)" };
  }
  return { ok: true, message: "Contrast check passed (stub — server-side AA pending Playwright)" };
}

function pageWeightStub(content: Record<string, unknown>, theme: Record<string, unknown>): {
  ok: boolean;
  message: string;
  warn?: boolean;
} {
  const bytes = JSON.stringify({ content, theme }).length;
  if (bytes > 900_000) {
    return { ok: false, message: `Estimated page payload ${Math.round(bytes / 1024)}KB exceeds 1MB stub limit` };
  }
  if (bytes > 700_000) {
    return {
      ok: true,
      warn: true,
      message: `Estimated page payload ${Math.round(bytes / 1024)}KB — review before publish`,
    };
  }
  return { ok: true, message: "Page weight within stub budget (<1MB)" };
}

export function runPrePublishChecklist(site: Record<string, unknown>): ChecklistItem[] {
  const content = (site.contentJson as Record<string, unknown> | undefined) ?? {};
  const theme = (site.themeJson as Record<string, unknown> | undefined) ?? {};
  const profile = (site.businessProfileJson as Record<string, unknown> | undefined) ?? {};
  const seo = (content.seo as Record<string, unknown> | undefined) ?? {};
  const brand = (theme.brand as Record<string, unknown> | undefined) ?? {};
  const packRefs = imageResolver.packRefsFromProfile(profile);

  const items: ChecklistItem[] = [];

  const hasHero = Boolean((content.hero as Record<string, unknown> | undefined)?.headline);
  const placeholders = imageResolver.contentHasPlaceholders(content);
  items.push({
    id: "content_sections",
    ok: hasHero && !placeholders,
    message: placeholders
      ? "Placeholder copy detected — replace before publish"
      : hasHero
        ? "Core sections have content"
        : "Hero section still has placeholders",
  });

  items.push({
    id: "seo",
    ok: Boolean(seo.title && seo.description),
    message:
      seo.title && seo.description
        ? "SEO title and description present"
        : "SEO metadata missing (title + description required)",
  });

  const jsonLdOk = Boolean(seo.title || (content.localBusiness as Record<string, unknown> | undefined)?.name);
  items.push({
    id: "json_ld",
    ok: jsonLdOk,
    warn: !jsonLdOk,
    message: jsonLdOk ? "JSON-LD / LocalBusiness fields present" : "JSON-LD stub — add seo.title or localBusiness.name",
  });

  const cta = String(profile.cta_preference ?? "");
  const whatsapp = String(profile.whatsapp_number ?? "");
  const phone = String(profile.phone ?? profile.phone_number ?? "");
  let ctaOk = true;
  let ctaMessage = "CTA configuration valid";
  if (cta === "whatsapp") {
    ctaOk = /^\+?[0-9]{8,15}$/.test(whatsapp);
    ctaMessage = ctaOk ? "WhatsApp CTA valid" : "WhatsApp number format invalid";
  } else if (cta === "phone") {
    ctaOk = /^\+?[0-9]{8,15}$/.test(phone);
    ctaMessage = ctaOk ? "Phone CTA valid" : "Phone number format invalid for phone CTA";
  } else if (cta === "form") {
    ctaOk = Boolean(profile.business_name ?? profile.email ?? profile.contact_email);
    ctaMessage = ctaOk ? "Form CTA contact fields present" : "Form CTA needs business name or email";
  }
  items.push({ id: "cta", ok: ctaOk, message: ctaMessage });

  const resolved = imageResolver.resolveSiteImages({
    content,
    theme,
    businessProfile: profile,
    packRefs,
  });
  const imagesOk = imageResolver.allSlotsResolved(resolved);
  items.push({
    id: "images",
    ok: imagesOk,
    message: imagesOk ? "All image slots resolve" : "Some image slots unresolved",
  });

  const contrast = contrastRatioStub(theme);
  items.push({
    id: "contrast",
    ok: contrast.ok,
    warn: !contrast.ok,
    message: contrast.message,
  });

  const faviconOk = Boolean(brand.favicon_url || brand.logo_url);
  items.push({
    id: "favicon",
    ok: faviconOk,
    warn: !faviconOk,
    message: faviconOk ? "Favicon/logo present" : "No favicon — text logo fallback will be used",
  });

  const weight = pageWeightStub(content, theme);
  items.push({
    id: "page_weight",
    ok: weight.ok,
    warn: weight.warn,
    message: weight.message,
  });

  items.push({
    id: "mobile_screenshot",
    ok: true,
    warn: true,
    message: "375px screenshot stub — capture runs in worker (not implemented)",
  });

  items.push({
    id: "template",
    ok: Boolean(site.templateId),
    message: site.templateId ? "Template selected" : "No template selected",
  });

  return items;
}

export async function allocateSubdomain(site: Record<string, unknown>): Promise<string> {
  const profile = (site.businessProfileJson as Record<string, unknown> | undefined) ?? {};
  const baseName = String(profile.business_name ?? site.siteId ?? "site");
  let candidate = slugifySubdomain(baseName) || "site";
  if (RESERVED_SUBDOMAINS.has(candidate)) candidate = `${candidate}-1`;

  for (let n = 0; n < 20; n++) {
    const trySlug = n === 0 ? candidate : `${candidate}-${n + 1}`;
    const existing = await sitesRepo.getBySubdomain(trySlug);
    if (!existing || existing.siteId === site.siteId) return trySlug;
  }
  return `${candidate}-${Date.now().toString(36)}`;
}

export async function publishSite(siteId: string): Promise<{
  site: Record<string, unknown>;
  checklist: ChecklistItem[];
  revalidateTag: string;
  versionId: string;
}> {
  const site = await sitesRepo.get(siteId);
  if (!site) throw new Error("site not found");

  const checklist = runPrePublishChecklist(site);
  const blockers = checklist.filter((c) => !c.ok && !c.warn);
  if (blockers.length) {
    throw new Error(`pre-publish checklist failed: ${blockers.map((b) => b.id).join(", ")}`);
  }

  const subdomain = site.subdomain ? String(site.subdomain) : await allocateSubdomain(site);
  const result = await sitesRepo.publishAtomic(siteId, {
    subdomain,
    contentJson: (site.contentJson as Record<string, unknown>) ?? {},
    themeJson: (site.themeJson as Record<string, unknown>) ?? {},
    templateVersion: String(site.templateVersion ?? site.templateId ?? "1"),
  });

  return {
    site: result.site,
    checklist,
    revalidateTag: `site:${subdomain}`,
    versionId: result.versionId,
  };
}

export async function getPublishedSnapshot(subdomain: string): Promise<Record<string, unknown> | null> {
  const site = await sitesRepo.getBySubdomain(subdomain);
  if (!site || site.status !== "published") return null;
  const profile = (site.businessProfileJson as Record<string, unknown> | undefined) ?? {};
  const packRefs = imageResolver.packRefsFromProfile(profile);
  const resolvedImages = imageResolver.resolveSiteImages({
    content: (site.contentJson as Record<string, unknown>) ?? {},
    theme: (site.themeJson as Record<string, unknown>) ?? {},
    businessProfile: profile,
    packRefs,
  });
  return {
    subdomain,
    templateId: site.templateId,
    templateVersion: site.templateVersion,
    contentJson: site.contentJson,
    themeJson: site.themeJson,
    businessProfileJson: site.businessProfileJson,
    resolvedImages,
    publishedAt: site.updatedAt,
  };
}
