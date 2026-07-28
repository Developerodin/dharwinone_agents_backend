/** Rule-based template matcher — NOT AI (Phase 1 M1). */
import {
  getConfigBySegmentSubcategory,
  getMatcherForProfile,
  inferTaxonomy,
} from "../data/categoryCatalog";
import {
  DEFAULT_BESPOKE_TEMPLATE_ID,
  resolveToBespokeTemplateId,
} from "../data/bespokeTemplateMapping";
import { listActiveTemplates, type TemplateRegistryEntry } from "../data/templateRegistry";

const TONE_STYLE_MAP: Record<string, string[]> = {
  warm: ["warm", "local_trustworthy", "split_hero"],
  professional: ["professional", "corporate", "clean"],
  bold: ["bold", "fullbleed", "urgency", "dark_hero"],
  minimalist: ["minimalist", "minimal", "clean"],
  premium: ["premium", "dark_hero", "editorial"],
  playful: ["playful", "cards", "gradient_modern"],
  sleek: ["sleek", "structured"],
  organic: ["organic", "warm"],
  tech: ["tech", "gradient_modern"],
};

function profileText(profile: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof profile.description === "string") parts.push(profile.description);
  if (typeof profile.business_name === "string") parts.push(profile.business_name);
  if (Array.isArray(profile.services)) parts.push(profile.services.map(String).join(" "));
  return parts.join(" ").toLowerCase();
}

function resolvedTaxonomy(profile: Record<string, unknown>): {
  category: string;
  subcategory: string;
  inferred: ReturnType<typeof inferTaxonomy>;
} {
  const inferred = inferTaxonomy(profileText(profile));
  const explicitCategory = typeof profile.category === "string" ? profile.category : "";
  const explicitSubcategory = typeof profile.subcategory === "string" ? profile.subcategory : "";

  if (explicitSubcategory) {
    return {
      category: explicitCategory || inferred?.category || "",
      subcategory: explicitSubcategory,
      inferred,
    };
  }

  if (
    inferred &&
    (!explicitCategory || (inferred.category !== explicitCategory && inferred.confidence > 0))
  ) {
    return {
      category: inferred.category,
      subcategory: inferred.subcategory,
      inferred,
    };
  }

  return {
    category: explicitCategory || inferred?.category || "",
    subcategory: inferred?.subcategory || "",
    inferred,
  };
}

function scoreTemplate(template: TemplateRegistryEntry, profile: Record<string, unknown>): {
  score: number;
  reasons: string[];
} {
  let score = 0;
  const reasons: string[] = [];
  const { category, subcategory, inferred } = resolvedTaxonomy(profile);

  if (category && template.category === category) {
    score += 10;
    reasons.push("category match");
  }
  if (subcategory && template.subcategory === subcategory) {
    score += 8;
    reasons.push("subcategory match");
  } else if (subcategory && template.subcategory !== subcategory && template.category === category) {
    score += 2;
    reasons.push("same category family");
  }

  const matcher =
    getMatcherForProfile(profile) ??
    (category && subcategory
      ? getConfigBySegmentSubcategory(category, subcategory)?.matcher
      : null);

  if (matcher) {
    if (matcher.eligible_template_ids.includes(template.id)) {
      score += 12;
      reasons.push("catalog eligible");
    }
    const rankIndex = matcher.default_rank_order.indexOf(template.id);
    if (rankIndex >= 0) {
      score += Math.max(0, 6 - rankIndex);
      reasons.push(`catalog rank ${rankIndex + 1}`);
    }
  }

  const tone = String(profile.tone_preference ?? "");
  const toneTags = TONE_STYLE_MAP[tone] ?? (tone ? [tone] : []);
  for (const tag of toneTags) {
    if (template.style_tags.includes(tag)) {
      score += 3;
      reasons.push(`tone:${tag}`);
    }
  }

  const cta = String(profile.cta_preference ?? "");
  if (cta === "whatsapp" && template.style_tags.includes("whatsapp_cta")) {
    score += 5;
    reasons.push("whatsapp CTA fit");
  }

  if (inferred && !profile.category && inferred.confidence > 0) {
    if (template.category === inferred.category) {
      score += 5;
      reasons.push("inferred segment");
    }
    if (template.subcategory === inferred.subcategory) {
      score += 4;
      reasons.push("inferred subcategory");
    }
  }

  return { score, reasons };
}

export function matchTemplates(businessProfile: Record<string, unknown>): Array<{
  templateId: string;
  score: number;
  reason: string;
}> {
  const ranked = listActiveTemplates()
    .map((template) => {
      const { score, reasons } = scoreTemplate(template, businessProfile);
      return {
        templateId: template.id,
        score,
        reason: reasons.length ? reasons.join(", ") : "general fit",
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.templateId.localeCompare(b.templateId));

  const top = ranked.slice(0, 3);
  if (top.length >= 2) return top;

  const fallbackId = resolveToBespokeTemplateId(null, businessProfile);
  const fallbackEntry = listActiveTemplates().find((t) => t.id === fallbackId);
  if (fallbackEntry && !top.some((t) => t.templateId === fallbackId)) {
    top.push({
      templateId: fallbackId,
      score: 1,
      reason: "category bespoke default",
    });
  }
  return top.slice(0, 3);
}
