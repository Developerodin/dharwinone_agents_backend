import {
  BESPOKE_TEMPLATE_IDS,
  isBespokeTemplateId,
  isEnabledBespokeTemplateId,
} from "./bespokeTemplateMapping";
import catalog from "./templatesCatalog.json";

export type TemplateRegistryEntry = {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  version: number;
  status: "active" | "deprecated";
  style_tags: string[];
  description: string;
  preview_desktop_url: string;
  preview_mobile_url: string;
  section_schema: Record<string, unknown>;
};

/**
 * Section order every launch template ships. Content-gated at render time:
 * sections with no content skip themselves (see _render/sections/*), so listing
 * all ten here is safe — a site only shows the ones the content agent filled.
 */
export const DEFAULT_SECTION_ORDER = [
  "hero",
  "services",
  "why_us",
  "gallery",
  "about",
  "pricing",
  "testimonials",
  "faq",
  "contact",
  "cta_footer",
];

/** Field descriptors for every renderable section — drives content generation + clamping. */
const SECTION_FIELD_SCHEMA: Record<string, unknown> = {
  hero: {
    headline: { type: "string", maxLength: 60 },
    subtext: { type: "string", maxLength: 140 },
    cta_text: { type: "string", maxLength: 25 },
  },
  services: {
    section_title: { type: "string", maxLength: 40 },
    items: {
      maxItems: 8,
      item: {
        title: { type: "string", maxLength: 40 },
        desc: { type: "string", maxLength: 120 },
      },
    },
  },
  why_us: {
    section_title: { type: "string", maxLength: 40 },
    points: { maxItems: 5, item: { type: "string", maxLength: 80 } },
  },
  about: {
    section_title: { type: "string", maxLength: 40 },
    body: { type: "string", maxLength: 400 },
  },
  gallery: {
    section_title: { type: "string", maxLength: 40 },
  },
  pricing: {
    section_title: { type: "string", maxLength: 40 },
    items: {
      maxItems: 3,
      item: {
        title: { type: "string", maxLength: 40 },
        price: { type: "string", maxLength: 20 },
        desc: { type: "string", maxLength: 120 },
      },
    },
  },
  testimonials: {
    section_title: { type: "string", maxLength: 40 },
    items: {
      maxItems: 6,
      item: {
        name: { type: "string", maxLength: 30 },
        quote: { type: "string", maxLength: 160 },
      },
    },
  },
  faq: {
    section_title: { type: "string", maxLength: 40 },
    items: {
      maxItems: 6,
      item: {
        question: { type: "string", maxLength: 120 },
        answer: { type: "string", maxLength: 300 },
      },
    },
  },
  contact: {
    section_title: { type: "string", maxLength: 40 },
  },
};

const HERO_IMAGE_SLOTS = {
  "hero.background": {
    role: "background",
    aspect: "16:9",
    minPx: { w: 1920, h: 1080 },
    displayPx: { w: 1920, h: 1080 },
    safeZone: "center",
    label: "Hero background",
    required: false,
  },
};

function sectionSchema(templateId: string): Record<string, unknown> {
  return {
    template_id: templateId,
    template_version: 1,
    sections: DEFAULT_SECTION_ORDER,
    image_slots: HERO_IMAGE_SLOTS,
    schema: SECTION_FIELD_SCHEMA,
  };
}

/**
 * Full launch catalog (templates.manifest.json), moved out of the retired Python
 * studio. Every entry maps to one of the 6 render families via style_tags[0];
 * the JSON→React renderer content-gates sections, so all share DEFAULT_SECTION_ORDER.
 */
type CatalogEntry = {
  id: string;
  segment: string | null;
  subcategory: string | null;
  family: string;
  intents?: string[];
};

import familiesCatalog from "./familiesCatalog.json";

const FAMILY_LABELS: Record<string, string> = Object.fromEntries(
  familiesCatalog.families.map((row) => [row.id, row.name]),
);

function titleize(s: string): string {
  return s
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

function catalogEntryToRegistry(t: CatalogEntry): TemplateRegistryEntry {
  const versionMatch = t.id.match(/_v(\d+)$/);
  const version = versionMatch ? Number(versionMatch[1]) : 1;
  const familyLabel = FAMILY_LABELS[t.family] ?? titleize(t.family);
  const base = titleize(t.subcategory ?? t.segment ?? "generic");
  const intents = t.intents ?? [];
  return {
    id: t.id,
    name: `${base} — ${familyLabel}${version > 1 ? ` v${version}` : ""}`,
    category: t.segment ?? "general",
    subcategory: t.subcategory ?? "",
    version,
    status: "active",
    // style_tags[0] MUST be the family — familyFromTemplateId reads it.
    style_tags: [t.family, ...intents],
    description: `${familyLabel} layout for ${base}.`,
    preview_desktop_url: `/template-preview/launch/${t.id}`,
    preview_mobile_url: `/template-preview/launch/${t.id}`,
    section_schema: sectionSchema(t.id),
  };
}

const CATALOG_TEMPLATES: TemplateRegistryEntry[] = (catalog.templates as CatalogEntry[]).map(
  catalogEntryToRegistry,
);

export const TEMPLATE_REGISTRY: TemplateRegistryEntry[] = CATALOG_TEMPLATES;

export function listActiveTemplates(): TemplateRegistryEntry[] {
  return TEMPLATE_REGISTRY.filter(
    (t) => t.status === "active" && isEnabledBespokeTemplateId(t.id),
  );
}

/** Lookup by id — returns entry only for bespoke launch templates. */
export function getTemplate(templateId: string): TemplateRegistryEntry | undefined {
  if (!isBespokeTemplateId(templateId)) return undefined;
  return TEMPLATE_REGISTRY.find((t) => t.id === templateId);
}

export { BESPOKE_TEMPLATE_IDS };
