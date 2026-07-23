import fs from "node:fs";
import path from "node:path";
import { backendPath } from "../paths";

export type CategoryMatcher = {
  eligible_template_ids: string[];
  default_rank_order: string[];
};

export type CategoryConfig = {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  wave?: number;
  status?: string;
  default_family?: string;
  keywords: string[];
  matcher?: CategoryMatcher;
  image_pack_refs?: string[];
  questionnaire?: Record<string, unknown>;
  moderation?: { blocked?: boolean; notes?: string };
  intents?: string[];
};

export type SegmentSummary = {
  categoryId: string;
  name: string;
  subcategories: Array<{ id: string; name: string; keywords: string[] }>;
  keywords: string[];
  imagePackRefs: string[];
};

export type TaxonomyInference = {
  category: string;
  subcategory: string;
  configId: string;
  confidence: number;
};

const SEGMENT_DISPLAY_NAMES: Record<string, string> = {
  real_estate: "Real Estate",
  local_service: "Local service",
  retail: "Retail & small shops",
  hospitality_travel: "Hospitality & travel",
  health_education: "Health & education",
  professional: "Professional services",
};

const SEGMENT_ORDER = [
  "real_estate",
  "local_service",
  "retail",
  "hospitality_travel",
  "health_education",
  "professional",
] as const;

const SUBCATEGORY_ORDER: Record<string, string[]> = {
  real_estate: ["broker", "agent", "rental_consultant", "luxury"],
  local_service: ["plumbing", "electrician", "landscaping", "car_wash", "cleaning_handyman", "insurance_agent"],
  retail: ["gift_shop", "print_shop", "clothing", "boutique", "handmade"],
  hospitality_travel: ["cafe", "restaurant", "travel_tourism"],
  health_education: ["clinic_medical", "fitness_gym", "education_coaching"],
  professional: ["agency_studio", "saas_startup", "portfolio_freelancer"],
};

let cachedConfigs: CategoryConfig[] | null = null;

function subcategoryDisplayName(config: CategoryConfig): string {
  const parts = config.name.split(/\s*[—–-]\s*/);
  if (parts.length >= 2) return parts[parts.length - 1]!.trim();
  return config.subcategory.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function loadConfigsFromDisk(): CategoryConfig[] {
  const root = backendPath("assets/categories");
  if (!fs.existsSync(root)) return [];

  const configs: CategoryConfig[] = [];
  for (const dirName of fs.readdirSync(root, { withFileTypes: true })) {
    if (!dirName.isDirectory()) continue;
    const configPath = path.join(root, dirName.name, "category.config.json");
    if (!fs.existsSync(configPath)) continue;
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8")) as CategoryConfig;
    configs.push({
      ...raw,
      keywords: Array.isArray(raw.keywords) ? raw.keywords : [],
    });
  }

  return configs.sort((a, b) => a.id.localeCompare(b.id));
}

function getConfigs(): CategoryConfig[] {
  if (cachedConfigs === null) {
    cachedConfigs = loadConfigsFromDisk();
  }
  return cachedConfigs;
}

export function resetCategoryCatalogCacheForTests(): void {
  cachedConfigs = null;
}

export function listCategoryConfigs(): CategoryConfig[] {
  return getConfigs();
}

export function listSegmentSummaries(): SegmentSummary[] {
  const bySegment = new Map<string, CategoryConfig[]>();
  for (const config of getConfigs()) {
    const list = bySegment.get(config.category) ?? [];
    list.push(config);
    bySegment.set(config.category, list);
  }

  const summaries: SegmentSummary[] = [];
  for (const segmentId of SEGMENT_ORDER) {
    const configs = bySegment.get(segmentId);
    if (!configs?.length) continue;

    const subcategories = configs
      .map((config) => ({
        id: config.subcategory,
        name: subcategoryDisplayName(config),
        keywords: config.keywords,
      }))
      .sort((a, b) => {
        const order = SUBCATEGORY_ORDER[segmentId] ?? [];
        const ai = order.indexOf(a.id);
        const bi = order.indexOf(b.id);
        if (ai >= 0 && bi >= 0) return ai - bi;
        if (ai >= 0) return -1;
        if (bi >= 0) return 1;
        return a.id.localeCompare(b.id);
      });

    const keywords = Array.from(new Set(configs.flatMap((config) => config.keywords)));
    const imagePackRefs = Array.from(
      new Set(configs.flatMap((config) => config.image_pack_refs ?? [])),
    );

    summaries.push({
      categoryId: segmentId,
      name: SEGMENT_DISPLAY_NAMES[segmentId] ?? segmentId.replace(/_/g, " "),
      subcategories,
      keywords,
      imagePackRefs: imagePackRefs.length ? imagePackRefs : [`pack/${segmentId}/default`],
    });
  }

  return summaries;
}

function scoreKeywords(text: string, keywords: string[]): number {
  const haystack = text.toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    const needle = keyword.trim().toLowerCase();
    if (!needle) continue;
    if (haystack.includes(needle)) score += 1;
  }
  return score;
}

export function inferTaxonomy(text: string): TaxonomyInference | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  let best: TaxonomyInference | null = null;
  for (const config of getConfigs()) {
    const confidence = scoreKeywords(trimmed, config.keywords);
    if (confidence <= 0) continue;
    const candidate: TaxonomyInference = {
      category: config.category,
      subcategory: config.subcategory,
      configId: config.id,
      confidence,
    };
    if (
      !best ||
      candidate.confidence > best.confidence ||
      (candidate.confidence === best.confidence && candidate.configId.localeCompare(best.configId) < 0)
    ) {
      best = candidate;
    }
  }

  return best;
}

export function getConfigBySegmentSubcategory(
  category: string,
  subcategory: string,
): CategoryConfig | null {
  return (
    getConfigs().find(
      (config) => config.category === category && config.subcategory === subcategory,
    ) ?? null
  );
}

export function getImagePackRefsForProfile(profile: Record<string, unknown>): string[] {
  const explicit = profile.image_pack_refs;
  if (Array.isArray(explicit) && explicit.length) {
    return explicit.map(String);
  }

  const category = typeof profile.category === "string" ? profile.category : "";
  const subcategory = typeof profile.subcategory === "string" ? profile.subcategory : "";

  if (category && subcategory) {
    const config = getConfigBySegmentSubcategory(category, subcategory);
    if (config?.image_pack_refs?.length) return [...config.image_pack_refs];
  }

  if (!category && !subcategory) {
    const parts: string[] = [];
    if (typeof profile.business_name === "string") parts.push(profile.business_name);
    if (Array.isArray(profile.services)) parts.push(profile.services.map(String).join(" "));
    const inferred = inferTaxonomy(parts.join(" "));
    if (inferred) {
      const config = getConfigBySegmentSubcategory(inferred.category, inferred.subcategory);
      if (config?.image_pack_refs?.length) return [...config.image_pack_refs];
    }
  }

  if (category) {
    const segment = listSegmentSummaries().find((row) => row.categoryId === category);
    if (segment?.imagePackRefs.length) return [...segment.imagePackRefs];
  }

  return ["pack/local_service/default"];
}

export function getMatcherForProfile(profile: Record<string, unknown>): CategoryMatcher | null {
  const explicitCategory = typeof profile.category === "string" ? profile.category : "";
  const explicitSubcategory = typeof profile.subcategory === "string" ? profile.subcategory : "";

  if (explicitCategory && explicitSubcategory) {
    return getConfigBySegmentSubcategory(explicitCategory, explicitSubcategory)?.matcher ?? null;
  }

  const parts: string[] = [];
  if (typeof profile.business_name === "string") parts.push(profile.business_name);
  if (Array.isArray(profile.services)) parts.push(profile.services.map(String).join(" "));
  const inferred = inferTaxonomy(parts.join(" "));
  if (!inferred) return null;

  const category = explicitCategory || inferred.category;
  const subcategory = explicitSubcategory || inferred.subcategory;
  return getConfigBySegmentSubcategory(category, subcategory)?.matcher ?? null;
}
