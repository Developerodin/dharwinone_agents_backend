/** Category-aware nouns for intake copy (e.g. "hospital" vs "shop" vs "business"). */

const ENTITY_BY_SUBCATEGORY: Record<string, string> = {
  clinic_medical: "clinic",
  fitness_gym: "gym",
  education_coaching: "academy",
  electrician: "electrical service",
  plumbing: "plumbing service",
  landscaping: "landscaping business",
  car_wash: "car wash",
  cleaning_handyman: "cleaning service",
  insurance_agent: "insurance agency",
  gift_shop: "shop",
  print_shop: "print shop",
  clothing: "store",
  boutique: "boutique",
  handmade: "shop",
  cafe: "café",
  restaurant: "restaurant",
  travel_tourism: "travel agency",
  agency_studio: "agency",
  saas_startup: "startup",
  broker: "brokerage",
  agent: "real estate business",
  rental_consultant: "property consultancy",
  luxury: "real estate business",
  wedding_planner: "planning business",
  event_venue: "venue",
  catering_service: "catering service",
  lawyer: "law firm",
  accountant: "accounting firm",
  financial_advisor: "advisory practice",
  photographer: "photography business",
  design_studio: "design studio",
  content_creator: "brand",
  salon_spa: "salon",
  wellness_studio: "wellness studio",
  nutrition_coach: "coaching practice",
  nonprofit: "organization",
  religious_org: "organization",
  community_group: "group",
  auto_repair: "auto repair shop",
  car_dealer: "dealership",
  auto_detailing: "detailing studio",
};

const FACILITY_TYPE_ENTITY: Record<string, string> = {
  general_multi_department: "hospital",
  dental_clinic: "dental clinic",
  diagnostic_lab: "diagnostic center",
  maternity_womens: "women's health center",
  day_surgery: "surgery center",
  primary_care_clinic: "clinic",
  single_specialty: "clinic",
};

const DESCRIPTION_ENTITY_HINTS: Array<{ pattern: RegExp; label: string; subcategories?: string[] }> = [
  { pattern: /\bhospital\b/i, label: "hospital", subcategories: ["clinic_medical"] },
  { pattern: /\bdental\b/i, label: "dental clinic", subcategories: ["clinic_medical"] },
  { pattern: /\b(diagnostic|pathology|radiology)\b/i, label: "diagnostic center", subcategories: ["clinic_medical"] },
];

export function inferEntityLabelFromDescription(
  description: string,
  subcategory?: string,
): string | undefined {
  const text = description.trim();
  if (!text) return undefined;

  for (const hint of DESCRIPTION_ENTITY_HINTS) {
    if (hint.subcategories && subcategory && !hint.subcategories.includes(subcategory)) continue;
    if (hint.pattern.test(text)) return hint.label;
  }
  return undefined;
}

type EntityFieldConfig = { entity_label?: string; label?: string };

/** Resolve the visitor-facing noun for business_name follow-ups. */
export function resolveEntityLabel(
  profile: Record<string, unknown>,
  fieldConfig?: EntityFieldConfig,
): string {
  if (typeof fieldConfig?.entity_label === "string" && fieldConfig.entity_label.trim()) {
    return fieldConfig.entity_label.trim();
  }

  if (typeof profile.entity_label === "string" && profile.entity_label.trim()) {
    return profile.entity_label.trim();
  }

  const subcategory = typeof profile.subcategory === "string" ? profile.subcategory : "";
  const facilityType = typeof profile.facility_type === "string" ? profile.facility_type : "";

  if (subcategory === "portfolio_freelancer") return "name";
  if (subcategory === "personal_blog") return "blog";
  if (subcategory === "saas_startup") return "product";

  if (facilityType && FACILITY_TYPE_ENTITY[facilityType]) {
    return FACILITY_TYPE_ENTITY[facilityType]!;
  }

  if (subcategory && ENTITY_BY_SUBCATEGORY[subcategory]) {
    return ENTITY_BY_SUBCATEGORY[subcategory]!;
  }

  return "business";
}

export function businessNameFollowUp(
  profile: Record<string, unknown>,
  fieldConfig?: EntityFieldConfig,
): string {
  const entity = resolveEntityLabel(profile, fieldConfig);

  if (entity === "name") {
    return 'What name should appear on your portfolio? For example, "Alex" or "Sam Rivera".';
  }

  if (entity === "blog") {
    return 'What name should appear on your blog? For example, "The Desk" or "Alex Chen".';
  }

  if (entity === "product") {
    return 'What\'s your product or company name? For example, "Axon" or "Securify".';
  }

  return `What is the name of your ${entity}? This appears on your site header and contact sections.`;
}
