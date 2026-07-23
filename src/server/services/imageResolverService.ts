/** Deterministic image slot resolver — upload → pack default → template default. */
import { getImagePackRefsForProfile } from "../data/categoryCatalog";

export type ResolvedImage = {
  slotKey: string;
  url: string | null;
  textLogo?: string;
  source: "upload" | "pack" | "template" | "text_logo";
  warnings?: string[];
};

/** Curated pack slot URLs — mirrors studio draft genre fallbacks until S3 packs are wired. */
const PACK_SLOT_DEFAULTS: Record<string, Record<string, string>> = {
  "pack/local_service/default": {
    hero: "/studio/placeholders/pack/local_service/hero.webp",
    about: "/studio/placeholders/pack/local_service/about.webp",
    services: "/studio/placeholders/pack/local_service/services.webp",
    gallery: "/studio/placeholders/pack/local_service/services.webp",
  },
  pack_cafe_v1: {
    hero: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1600&q=70",
    about: "https://images.unsplash.com/photo-1522992319-0365e5f11656?auto=format&fit=crop&w=1200&q=70",
    services: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=900&q=70",
    gallery: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=70",
  },
  pack_restaurant_v1: {
    hero: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&q=70",
    about: "https://images.unsplash.com/photo-1424847651672-bf20a4b0982b?auto=format&fit=crop&w=1200&q=70",
    services: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=70",
    gallery: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=900&q=70",
  },
  pack_travel_tourism_v1: {
    hero: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=1600&q=70",
    about: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1200&q=70",
    services: "https://images.unsplash.com/photo-1476514525535-07fb3b4eae5f?auto=format&fit=crop&w=900&q=70",
    gallery: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=900&q=70",
  },
  pack_fitness_gym_v1: {
    hero: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1600&q=70",
    about: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=70",
    services: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&w=900&q=70",
    gallery: "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=900&q=70",
  },
  pack_saas_startup_v1: {
    hero: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1600&q=70",
    about: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=70",
    services: "https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&w=900&q=70",
    gallery: "https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=900&q=70",
  },
  pack_electrician_v1: {
    hero: "/studio/placeholders/pack/local_service/hero.webp",
    about: "/studio/placeholders/pack/local_service/about.webp",
    services: "/studio/placeholders/pack/local_service/services.webp",
    gallery: "/studio/placeholders/pack/local_service/services.webp",
  },
  pack_plumbing_v1: {
    hero: "/studio/placeholders/pack/local_service/hero.webp",
    about: "/studio/placeholders/pack/local_service/about.webp",
    services: "/studio/placeholders/pack/local_service/services.webp",
    gallery: "/studio/placeholders/pack/local_service/services.webp",
  },
};

const TEMPLATE_SLOT_DEFAULTS: Record<string, string> = {
  hero: "/studio/placeholders/template/default/hero.webp",
  about: "/studio/placeholders/template/default/about.webp",
  logo: "/studio/placeholders/template/default/logo.webp",
  services: "/studio/placeholders/template/default/hero.webp",
  gallery: "/studio/placeholders/template/default/hero.webp",
};

const PLACEHOLDER_RE = /\{\{|\[placeholder\]|lorem ipsum|todo:/i;

export function packRefsFromProfile(profile: Record<string, unknown>): string[] {
  return getImagePackRefsForProfile(profile);
}

export function packSlotUrls(packRefs: string[], slotKey: string): string[] {
  const urls: string[] = [];
  for (const packRef of packRefs) {
    const url = PACK_SLOT_DEFAULTS[packRef]?.[slotKey];
    if (url) urls.push(url);
  }
  if (!urls.length && TEMPLATE_SLOT_DEFAULTS[slotKey]) {
    urls.push(TEMPLATE_SLOT_DEFAULTS[slotKey]!);
  }
  return urls;
}

export function pickPackUrl(packRefs: string[], slotKey: string, index = 0): string | null {
  const urls = packSlotUrls(packRefs, slotKey);
  if (!urls.length) return null;
  return urls[index % urls.length] ?? null;
}

export function contentHasPlaceholders(content: Record<string, unknown>): boolean {
  const text = JSON.stringify(content);
  return PLACEHOLDER_RE.test(text);
}

export function logoTextFallback(businessProfile: Record<string, unknown>): string {
  const brand = (businessProfile.brand as Record<string, unknown> | undefined) ?? businessProfile;
  const name =
    String(brand.business_name ?? brand.brandName ?? brand.name ?? "").trim() ||
    String((businessProfile.business as Record<string, unknown> | undefined)?.type ?? "").trim();
  if (!name) return "Your Business";
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function resolveSlot(input: {
  slotKey: string;
  uploads?: Record<string, { publicUrl?: string; url?: string }>;
  packRefs?: string[];
  templateDefaults?: Record<string, string>;
}): ResolvedImage {
  const upload = input.uploads?.[input.slotKey];
  const uploadUrl = upload?.publicUrl ?? upload?.url ?? null;
  if (uploadUrl) {
    return { slotKey: input.slotKey, url: uploadUrl, source: "upload" };
  }

  for (const packRef of input.packRefs ?? []) {
    const packUrl = PACK_SLOT_DEFAULTS[packRef]?.[input.slotKey];
    if (packUrl) {
      return { slotKey: input.slotKey, url: packUrl, source: "pack" };
    }
  }

  const templateUrl =
    input.templateDefaults?.[input.slotKey] ?? TEMPLATE_SLOT_DEFAULTS[input.slotKey] ?? null;
  if (templateUrl) {
    return { slotKey: input.slotKey, url: templateUrl, source: "template" };
  }

  return { slotKey: input.slotKey, url: null, source: "template" };
}

export function resolveLogo(input: {
  businessProfile: Record<string, unknown>;
  theme: Record<string, unknown>;
  uploads?: Record<string, { publicUrl?: string; url?: string }>;
  packRefs?: string[];
}): ResolvedImage {
  const brand = (input.theme.brand as Record<string, unknown> | undefined) ?? {};
  const logoUrl = String(brand.logo_url ?? brand.favicon_url ?? "");
  if (logoUrl) {
    return { slotKey: "logo", url: logoUrl, source: "upload" };
  }

  const upload = input.uploads?.logo;
  const uploadUrl = upload?.publicUrl ?? upload?.url ?? null;
  if (uploadUrl) {
    return { slotKey: "logo", url: uploadUrl, source: "upload" };
  }

  const packLogo = (input.packRefs ?? [])
    .map((ref) => PACK_SLOT_DEFAULTS[ref]?.logo)
    .find(Boolean);
  if (packLogo) {
    return { slotKey: "logo", url: packLogo, source: "pack" };
  }

  const textLogo = logoTextFallback(input.businessProfile);
  return { slotKey: "logo", url: null, textLogo, source: "text_logo" };
}

export function resolveSiteImages(input: {
  content: Record<string, unknown>;
  theme: Record<string, unknown>;
  businessProfile: Record<string, unknown>;
  uploads?: Record<string, { publicUrl?: string; url?: string }>;
  packRefs?: string[];
  slotKeys?: string[];
}): ResolvedImage[] {
  const packRefs = input.packRefs ?? packRefsFromProfile(input.businessProfile);
  const slots = input.slotKeys ?? ["hero", "about", "logo"];
  const resolved = slots
    .filter((k) => k !== "logo")
    .map((slotKey) =>
      resolveSlot({
        slotKey,
        uploads: input.uploads,
        packRefs,
      }),
    );
  resolved.unshift(
    resolveLogo({
      businessProfile: input.businessProfile,
      theme: input.theme,
      uploads: input.uploads,
      packRefs,
    }),
  );
  return resolved;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function withImage(section: Record<string, unknown> | null, url: string | null): Record<string, unknown> | null {
  if (!section || !url) return section;
  if (typeof section.image === "string" && section.image.trim()) return section;
  return { ...section, image: url };
}

function withItemImages(
  items: unknown,
  packRefs: string[],
  slotKey: string,
): unknown {
  if (!Array.isArray(items)) return items;
  return items.map((item, index) => {
    const row = asRecord(item);
    if (!row) return item;
    if (typeof row.image === "string" && row.image.trim()) return row;
    const url = pickPackUrl(packRefs, slotKey, index);
    return url ? { ...row, image: url } : row;
  });
}

/** Merge resolved pack/template images into content + theme for frontend BaseTemplate preview. */
export function injectResolvedImagesIntoContent(input: {
  content: Record<string, unknown>;
  theme: Record<string, unknown>;
  businessProfile: Record<string, unknown>;
  packRefs?: string[];
  uploads?: Record<string, { publicUrl?: string; url?: string }>;
}): { content: Record<string, unknown>; theme: Record<string, unknown> } {
  const packRefs = input.packRefs ?? packRefsFromProfile(input.businessProfile);
  const content: Record<string, unknown> = { ...input.content };
  const theme: Record<string, unknown> = { ...input.theme };

  const hero = resolveSlot({ slotKey: "hero", packRefs, uploads: input.uploads });
  content.hero = withImage(asRecord(content.hero), hero.url) ?? content.hero;

  const about = resolveSlot({ slotKey: "about", packRefs, uploads: input.uploads });
  if (content.about) {
    content.about = withImage(asRecord(content.about), about.url) ?? content.about;
  }

  const services = asRecord(content.services);
  if (services?.items) {
    content.services = {
      ...services,
      items: withItemImages(services.items, packRefs, "services"),
    };
  }

  const gallery = asRecord(content.gallery);
  if (gallery?.items) {
    content.gallery = {
      ...gallery,
      items: withItemImages(gallery.items, packRefs, "gallery"),
    };
  }

  const testimonials = asRecord(content.testimonials);
  if (testimonials?.items) {
    content.testimonials = {
      ...testimonials,
      items: withItemImages(testimonials.items, packRefs, "gallery"),
    };
  }

  const logo = resolveLogo({
    businessProfile: input.businessProfile,
    theme,
    packRefs,
    uploads: input.uploads,
  });
  if (logo.url) {
    const brand = { ...(asRecord(theme.brand) ?? {}), logo_url: logo.url };
    theme.brand = brand;
  }

  return { content, theme };
}

export function allSlotsResolved(resolved: ResolvedImage[]): boolean {
  return resolved.every((r) => Boolean(r.url || r.textLogo));
}
