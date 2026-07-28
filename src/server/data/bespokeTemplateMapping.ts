/** Bespoke launch templates — the only templates selectable, matched, and rendered. */
export const BESPOKE_TEMPLATE_IDS = [
  "he_fitness_v1",
  "he_fitness_v2",
  "pf_portfolio_jack_v1",
  "pf_blog_scroll_v1",
  "he_vibrant_wellness_v1",
  "he_dental_v1",
  "gn_axon_v1",
  "ps_securify_v1",
] as const;

/** Temporarily hidden from matcher/picker/preview; existing sites keep their template id. */
export const DISABLED_BESPOKE_TEMPLATE_IDS = ["he_dental_v1"] as const;

export type BespokeTemplateId = (typeof BESPOKE_TEMPLATE_IDS)[number];

export const DEFAULT_BESPOKE_TEMPLATE_ID: BespokeTemplateId = "gn_axon_v1";

const BESPOKE_BY_SEGMENT_SUBCATEGORY: Record<string, readonly BespokeTemplateId[]> = {
  "health_education|fitness_gym": ["he_fitness_v1", "he_fitness_v2"],
  "health_education|clinic_medical": ["he_vibrant_wellness_v1"],
  "health_education|education_coaching": ["he_vibrant_wellness_v1", "gn_axon_v1"],
  "professional|portfolio_freelancer": ["pf_portfolio_jack_v1"],
  "professional|personal_blog": ["pf_blog_scroll_v1"],
  "professional|saas_startup": ["gn_axon_v1", "ps_securify_v1"],
  "professional|agency_studio": ["gn_axon_v1", "pf_portfolio_jack_v1"],
  "creative_media|content_creator": ["pf_portfolio_jack_v1"],
  "creative_media|design_studio": ["pf_portfolio_jack_v1"],
  "creative_media|photographer": ["pf_portfolio_jack_v1"],
  "beauty_wellness|nutrition_coach": ["he_vibrant_wellness_v1"],
  "beauty_wellness|salon_spa": ["he_vibrant_wellness_v1"],
  "beauty_wellness|wellness_studio": ["he_vibrant_wellness_v1"],
  "hospitality_travel|cafe": ["he_vibrant_wellness_v1"],
  "hospitality_travel|restaurant": ["he_vibrant_wellness_v1"],
  "hospitality_travel|travel_tourism": ["he_vibrant_wellness_v1", "gn_axon_v1"],
  "events_weddings|catering_service": ["he_vibrant_wellness_v1"],
  "events_weddings|event_venue": ["he_vibrant_wellness_v1"],
  "events_weddings|wedding_planner": ["he_vibrant_wellness_v1", "pf_portfolio_jack_v1"],
  "legal_finance|accountant": ["ps_securify_v1", "gn_axon_v1"],
  "legal_finance|financial_advisor": ["ps_securify_v1", "gn_axon_v1"],
  "legal_finance|lawyer": ["ps_securify_v1", "gn_axon_v1"],
  "local_service|car_wash": ["gn_axon_v1"],
  "local_service|cleaning_handyman": ["gn_axon_v1"],
  "local_service|electrician": ["gn_axon_v1"],
  "local_service|insurance_agent": ["ps_securify_v1", "gn_axon_v1"],
  "local_service|landscaping": ["gn_axon_v1"],
  "local_service|plumbing": ["gn_axon_v1"],
  "nonprofit_community|community_group": ["he_vibrant_wellness_v1"],
  "nonprofit_community|nonprofit": ["he_vibrant_wellness_v1"],
  "nonprofit_community|religious_org": ["he_vibrant_wellness_v1"],
  "real_estate|agent": ["gn_axon_v1"],
  "real_estate|broker": ["gn_axon_v1"],
  "real_estate|luxury": ["gn_axon_v1", "pf_portfolio_jack_v1"],
  "real_estate|rental_consultant": ["gn_axon_v1"],
  "retail|boutique": ["pf_portfolio_jack_v1"],
  "retail|clothing": ["pf_portfolio_jack_v1"],
  "retail|gift_shop": ["pf_portfolio_jack_v1"],
  "retail|handmade": ["pf_portfolio_jack_v1"],
  "retail|print_shop": ["pf_portfolio_jack_v1"],
  "automotive|auto_detailing": ["gn_axon_v1"],
  "automotive|auto_repair": ["gn_axon_v1"],
  "automotive|car_dealer": ["gn_axon_v1", "pf_portfolio_jack_v1"],
};

export function isBespokeTemplateId(id: string): id is BespokeTemplateId {
  return (BESPOKE_TEMPLATE_IDS as readonly string[]).includes(id);
}

export function isEnabledBespokeTemplateId(id: string): id is BespokeTemplateId {
  return isBespokeTemplateId(id) && !(DISABLED_BESPOKE_TEMPLATE_IDS as readonly string[]).includes(id);
}

export function enabledBespokeTemplateIds(): readonly BespokeTemplateId[] {
  return BESPOKE_TEMPLATE_IDS.filter(
    (id) => !(DISABLED_BESPOKE_TEMPLATE_IDS as readonly string[]).includes(id),
  );
}

export function bespokeTemplatesForCategory(
  category: string,
  subcategory: string,
): readonly BespokeTemplateId[] {
  const key = `${category}|${subcategory}`;
  return BESPOKE_BY_SEGMENT_SUBCATEGORY[key] ?? [DEFAULT_BESPOKE_TEMPLATE_ID];
}

export function defaultBespokeForProfile(profile: Record<string, unknown>): BespokeTemplateId {
  const category = typeof profile.category === "string" ? profile.category : "";
  const subcategory = typeof profile.subcategory === "string" ? profile.subcategory : "";
  if (category && subcategory) {
    return bespokeTemplatesForCategory(category, subcategory)[0]!;
  }
  return DEFAULT_BESPOKE_TEMPLATE_ID;
}

/** Remap legacy generic catalog ids to the nearest bespoke template for the site category. */
export function resolveToBespokeTemplateId(
  templateId: string | null | undefined,
  profile: Record<string, unknown> = {},
): BespokeTemplateId {
  if (templateId && isBespokeTemplateId(templateId)) return templateId;
  return defaultBespokeForProfile(profile);
}
