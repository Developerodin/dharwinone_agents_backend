import { z } from "zod";

/** Phase 1 business_profile — see Phase1_Static_Website_Builder_Plan.md §6.1 */
export const BusinessProfileSchema = z
  .object({
    business_name: z.string().max(80).optional(),
    /** One-line blog or site description shown near the hero. */
    tagline: z.string().max(120).optional(),
    /** Intake copy hint — e.g. "hospital" when the user said hospital, not clinic. */
    entity_label: z.string().max(64).optional(),
    category: z.string().max(64).optional(),
    subcategory: z.string().max(64).optional(),
    city: z.string().max(80).optional(),
    country: z.string().max(80).optional(),
    country_code: z.string().length(2).optional(),
    service_area: z.array(z.string().max(80)).max(12).optional(),
    services: z.array(z.string().max(80)).max(12).optional(),
    facility_type: z.string().max(64).optional(),
    product_type: z.string().max(64).optional(),
    studio_type: z.string().max(64).optional(),
    tone_preference: z.string().max(64).optional(),
    theme_mode_preference: z.enum(["dark", "light", "toggle"]).optional(),
    newsletter_cta: z.string().max(80).optional(),
    cta_preference: z
      .enum(["whatsapp", "phone", "form", "newsletter", "email", "demo", "trial"])
      .optional(),
    phone: z.string().max(24).optional(),
    whatsapp_number: z.string().max(24).optional(),
    email: z.string().max(120).optional(),
    /** LinkedIn profile slug — optional, used by portfolio templates for footer socials. */
    linkedin_id: z.string().max(80).optional(),
    /** X (Twitter) handle — optional, used by portfolio templates for footer socials. */
    x_account: z.string().max(80).optional(),
    has_reviews: z.boolean().optional(),
    language: z.string().max(8).optional(),
    logo_url: z.string().max(512).optional(),
    brand_color_hint: z.string().max(16).optional(),
    image_sourcing_mode: z.enum(["user_provided", "ai_decide", "use_defaults"]).optional(),
    image_style_hint: z.string().max(64).optional(),
    image_pack_refs: z.array(z.string().max(128)).max(8).optional(),
    user_image_slots: z.record(z.string(), z.unknown()).optional(),
  })
  .strip();

export type BusinessProfile = z.infer<typeof BusinessProfileSchema>;

/**
 * Normalize a raw profile for gap-check. Lenient by design: a user's free-text
 * answer that fails a strict field (e.g. cta_preference must be whatsapp|phone|form)
 * is DROPPED, not thrown — so gap-check re-asks that field as "missing" instead of
 * crashing the whole request. Valid fields are kept; unknown keys are stripped.
 */
export function parseBusinessProfilePartial(
  raw: Record<string, unknown>,
): Partial<BusinessProfile> {
  const schema = BusinessProfileSchema.partial();
  const result = schema.safeParse(raw);
  if (result.success) return result.data;

  const invalidKeys = new Set(
    result.error.issues
      .map((issue) => issue.path[0])
      .filter((key): key is string => typeof key === "string"),
  );
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!invalidKeys.has(key)) cleaned[key] = value;
  }
  return schema.safeParse(cleaned).data ?? {};
}

export const PrefillRequestSchema = z.object({
  description: z.string().min(3).max(500),
  category: z.string().min(1).max(64),
  subcategory: z.string().max(64).optional(),
});

export const PrefillResponseSchema = BusinessProfileSchema;

export const GapCheckRequestSchema = z.object({
  businessProfile: z.record(z.string(), z.unknown()),
  categoryId: z.string().min(1).max(64),
});

export const GapQuestionSchema = z.object({
  field: z.string(),
  question: z.string(),
  tier: z.enum(["required", "recommended", "optional"]),
  hint: z.string().optional(),
  inputType: z.enum(["service_picker", "enum"]).optional(),
  suggestedServices: z.array(z.string()).optional(),
  options: z.array(z.string()).optional(),
  optionLabels: z.record(z.string(), z.string()).optional(),
});

export const GapCheckResponseSchema = z.object({
  complete: z.boolean(),
  followUps: z.array(GapQuestionSchema).max(3),
});

export const TemplateMatchRequestSchema = z.object({
  businessProfile: z.record(z.string(), z.unknown()),
});

export const TemplateMatchResponseSchema = z.object({
  matches: z.array(
    z.object({
      templateId: z.string(),
      score: z.number(),
      reason: z.string(),
    }),
  ),
});

export type ServiceCatalogEntry = {
  suggested_services: string[];
  featured_services?: string[];
};

export type QuestionnaireConfig = {
  required?: string[];
  recommended?: string[];
  fields?: Record<
    string,
    {
      label?: string;
      entity_label?: string;
      tier?: string;
      type?: string;
      options?: string[];
      option_labels?: Record<string, string>;
      followUp?: string;
      suggested_services?: string[];
    }
  >;
  service_catalog?: Record<string, ServiceCatalogEntry>;
};
