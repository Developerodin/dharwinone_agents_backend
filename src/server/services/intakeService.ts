/** Smart intake — AI prefill + rule-based gap-check (Phase 1 M1). */
import { z } from "zod";
import { getConfigBySegmentSubcategory, getImagePackRefsForProfile, inferTaxonomy } from "../data/categoryCatalog";
import { isUnrecognizedCountry, normalizeCountryInProfile } from "../data/countryCodes";
import { businessNameFollowUp, inferEntityLabelFromDescription } from "../data/entityLabels";
import * as categoriesRepo from "../repos/categoriesRepo";
import { loadOnboardingProvider } from "../llmProvider";
import {
  parseBusinessProfilePartial,
  GapCheckResponseSchema,
  PrefillResponseSchema,
  type QuestionnaireConfig,
  type ServiceCatalogEntry,
} from "../schemas/intakeSchemas";

const GENERIC_SERVICES = new Set(["services", "service", "help", "work", "business"]);

const DESCRIPTION_NAME_PATTERN =
  /\b(website|web\s*site|landing\s*page|site\s+with|with\s+menu|reservations?|location\s+map|online\s+presence)\b/i;

function isEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function isAmbiguousServices(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return true;
  if (value.length === 1) {
    const one = String(value[0]).trim().toLowerCase();
    return GENERIC_SERVICES.has(one) || one.length < 3;
  }
  return false;
}

/** Prefill heuristics often copy the whole prompt — treat that as missing. */
function isAmbiguousBusinessName(value: unknown): boolean {
  const name = String(value ?? "").trim();
  if (!name) return true;
  if (name.length < 2) return true;
  if (DESCRIPTION_NAME_PATTERN.test(name)) return true;
  const lower = name.toLowerCase();
  if (/^(a|an|the)\s+\w+\s+(website|business|restaurant|shop|store)\b/.test(lower)) return true;
  if (/\b(website|web site)\b/.test(lower)) return true;
  return false;
}

function fieldLabel(config: QuestionnaireConfig, field: string): string {
  return config.fields?.[field]?.label ?? field.replace(/_/g, " ");
}

function fieldFollowUp(
  config: QuestionnaireConfig,
  field: string,
  profile: Record<string, unknown>,
): string {
  if (field === "country" && isUnrecognizedCountry(profile)) {
    return (
      "I couldn't match that country — please use the full name (e.g. United States) " +
      "or a common acronym like UAE or USA."
    );
  }

  const custom = config.fields?.[field]?.followUp;
  if (custom) return custom;

  if (field === "service_area" && profile.city) {
    return `Only ${String(profile.city)}, or nearby areas too?`;
  }
  if (field === "whatsapp_number" && profile.cta_preference === "whatsapp") {
    return "What WhatsApp number should customers use to reach you?";
  }
  if (field === "phone" && profile.cta_preference === "phone") {
    return "What phone number should customers call? Include country code if helpful.";
  }
  if (field === "email") {
    if (profile.subcategory === "personal_blog") {
      return "What email should readers use to reach you or subscribe?";
    }
    if (profile.subcategory === "saas_startup") {
      return "What email should prospects use for demos, trials, or sales inquiries?";
    }
    if (profile.subcategory === "fitness_gym") {
      return "What email should members use for membership inquiries?";
    }
    if (profile.subcategory === "portfolio_freelancer") {
      return "What email should potential clients use to reach you?";
    }
    return "What email address should customers use to reach you?";
  }
  if (field === "linkedin_id") {
    return "What's your LinkedIn profile ID or username? (optional — reply skip to leave blank)";
  }
  if (field === "x_account") {
    return "What's your X (Twitter) handle? (optional — reply skip to leave blank)";
  }
  if (field === "services") {
    const suggested = suggestedServicesForField(config, field, profile);
    if (suggested?.length) return formatServicePickerQuestion(suggested);
    if (profile.subcategory === "personal_blog") {
      return "What do you write about? List a few topics or themes — for example, \"productivity\", \"essays\", or \"frontend development\".";
    }
    if (profile.subcategory === "portfolio_freelancer") {
      return "What do you offer clients? List your specialties — for example, \"brand identity\", \"3D modeling\", or \"web design\".";
    }
    if (profile.subcategory === "saas_startup") {
      return "Which key features should we highlight on your landing page?";
    }
    if (profile.subcategory === "fitness_gym") {
      return "Which classes or programs should we highlight?";
    }
    return "Which specific services should we highlight on your site?";
  }
  if (field === "facility_type" || field === "product_type" || field === "studio_type") {
    const custom = config.fields?.[field]?.followUp;
    const options = config.fields?.[field]?.options ?? [];
    const labels = config.fields?.[field]?.option_labels;
    if (options.length > 0) {
      const formatted = options.map((o) => labels?.[o] ?? o.replace(/_/g, " ")).join(" | ");
      return custom ? `${custom} ${formatted}` : `Please pick one: ${formatted}`;
    }
    return custom ?? `Could you share your ${fieldLabel(config, field).toLowerCase()}?`;
  }
  if (field === "business_name") {
    return businessNameFollowUp(profile, config.fields?.[field]);
  }
  if (field === "tagline") {
    return (
      config.fields?.tagline?.followUp ??
      "What's a one-line tagline or description for your site?"
    );
  }
  if (field === "theme_mode_preference") {
    const custom = config.fields?.theme_mode_preference?.followUp;
    const options = config.fields?.theme_mode_preference?.options ?? [];
    const labels = config.fields?.theme_mode_preference?.option_labels;
    if (options.length > 0) {
      const formatted = options.map((o) => labels?.[o] ?? o.replace(/_/g, " ")).join(" | ");
      return custom ? `${custom} ${formatted}` : `Pick a theme mode: ${formatted}`;
    }
    return custom ?? "Should your site default to dark mode, light mode, or include a toggle?";
  }
  if (field === "newsletter_cta") {
    return (
      config.fields?.newsletter_cta?.followUp ??
      "What should the subscribe button say? (Optional — reply skip to use a default)"
    );
  }
  if (field === "cta_preference") {
    const custom = config.fields?.cta_preference?.followUp;
    if (custom) return custom;
    if (profile.subcategory === "personal_blog") {
      return "How should readers subscribe or get in touch? Reply with newsletter signup, email link, or contact form.";
    }
    return "How should customers reach you on your site? Reply with WhatsApp, phone call, or contact form.";
  }
  const options = config.fields?.[field]?.options;
  if (options && options.length > 0) {
    return `Please pick your ${fieldLabel(config, field).toLowerCase()}: ${orJoin(options)}.`;
  }
  return `Could you share your ${fieldLabel(config, field).toLowerCase()}?`;
}

function orJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

function resolveServiceCatalogEntry(
  config: QuestionnaireConfig,
  profile: Record<string, unknown>,
): ServiceCatalogEntry | undefined {
  for (const key of ["facility_type", "product_type", "studio_type"] as const) {
    const value = profile[key];
    if (typeof value === "string" && value.trim()) {
      return config.service_catalog?.[value.trim()];
    }
  }
  return undefined;
}

/** Picker suggestions: featured list for multi-dept, else type-specific or field defaults. */
export function suggestedServicesForField(
  config: QuestionnaireConfig,
  field: string,
  profile: Record<string, unknown> = {},
): string[] | undefined {
  if (field === "services") {
    const catalog = resolveServiceCatalogEntry(config, profile);
    if (catalog) {
      const list =
        catalog.featured_services && catalog.featured_services.length > 0
          ? catalog.featured_services
          : catalog.suggested_services;
      const cleaned = list.map((s) => String(s).trim()).filter(Boolean);
      if (cleaned.length > 0) return cleaned;
    }
  }

  const raw = config.fields?.[field]?.suggested_services;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const cleaned = raw.map((s) => String(s).trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : undefined;
}

function followUpInputMeta(
  questionnaire: QuestionnaireConfig,
  field: string,
  profile: Record<string, unknown>,
): Record<string, unknown> {
  const fieldConfig = questionnaire.fields?.[field];
  if (field === "services") {
    const suggested = suggestedServicesForField(questionnaire, field, profile);
    if (suggested?.length) {
      return { inputType: "service_picker" as const, suggestedServices: suggested };
    }
  }
  if (fieldConfig?.type === "enum" && fieldConfig.options?.length) {
    return {
      inputType: "enum" as const,
      options: fieldConfig.options,
      ...(fieldConfig.option_labels ? { optionLabels: fieldConfig.option_labels } : {}),
    };
  }
  return {};
}

function formatServicePickerQuestion(suggested: string[]): string {
  const bullets = suggested.map((s) => `• ${s}`).join("\n");
  return (
    `For your site, we typically highlight these services:\n${bullets}\n\n` +
    `Do these look right? Reply "yes" to use them, list your own (comma-separated), ` +
    `or say "add …" to include extras.`
  );
}

function catalogTypeField(questionnaire: QuestionnaireConfig): string | null {
  if (!questionnaire.service_catalog) return null;
  for (const key of ["facility_type", "product_type", "studio_type"]) {
    if (questionnaire.fields?.[key]) return key;
  }
  return null;
}

function shouldSkipFieldGapCheck(
  questionnaire: QuestionnaireConfig,
  field: string,
  businessProfile: Record<string, unknown>,
): boolean {
  if (field !== "services") return false;
  const typeField = catalogTypeField(questionnaire);
  if (!typeField) return false;
  return isEmpty(businessProfile[typeField]);
}

function tierForField(config: QuestionnaireConfig, field: string): "required" | "recommended" | "optional" {
  if (config.required?.includes(field)) return "required";
  if (config.recommended?.includes(field)) return "recommended";
  return (config.fields?.[field]?.tier as "required" | "recommended" | "optional") ?? "optional";
}

/** Overlay subcategory-specific questionnaire fields (e.g. clinic_medical service_picker). */
export function resolveQuestionnaireForProfile(
  base: QuestionnaireConfig,
  businessProfile: Record<string, unknown>,
): QuestionnaireConfig {
  const category = typeof businessProfile.category === "string" ? businessProfile.category : "";
  const subcategory =
    typeof businessProfile.subcategory === "string" ? businessProfile.subcategory : "";
  if (!category || !subcategory) return base;

  const subConfig = getConfigBySegmentSubcategory(category, subcategory);
  const subQuestionnaire = subConfig?.questionnaire as QuestionnaireConfig | undefined;
  if (!subQuestionnaire?.fields) return base;

  return {
    ...base,
    required: subQuestionnaire.required ?? base.required,
    recommended: subQuestionnaire.recommended ?? base.recommended,
    fields: { ...(base.fields ?? {}), ...subQuestionnaire.fields },
    service_catalog: subQuestionnaire.service_catalog ?? base.service_catalog,
  };
}

/** Rule-based gap-check — max 2–3 pre-written follow-ups, no invented questions. */
export function gapCheck(
  businessProfile: Record<string, unknown>,
  questionnaire: QuestionnaireConfig,
): z.infer<typeof GapCheckResponseSchema> {
  const followUps: z.infer<typeof GapCheckResponseSchema>["followUps"] = [];
  const required = questionnaire.required ?? [];

  for (const field of required) {
    if (followUps.length >= 3) break;
    if (shouldSkipFieldGapCheck(questionnaire, field, businessProfile)) continue;
    const value = businessProfile[field];
    const missing = isEmpty(value);
    const ambiguous =
      field === "services"
        ? isAmbiguousServices(value)
        : field === "business_name"
          ? isAmbiguousBusinessName(value)
          : field === "country"
            ? isUnrecognizedCountry(businessProfile)
            : field === "service_area"
              ? !missing && Array.isArray(value) && value.length === 1 && value[0] === businessProfile.city
              : false;

    if (missing || ambiguous) {
      followUps.push({
        field,
        question: fieldFollowUp(questionnaire, field, businessProfile),
        tier: tierForField(questionnaire, field),
        hint: questionnaire.fields?.[field]?.label,
        ...followUpInputMeta(questionnaire, field, businessProfile),
      });
    }
  }

  for (const field of questionnaire.recommended ?? []) {
    if (followUps.length >= 3) break;
    if (followUps.some((q) => q.field === field)) continue;
    const value = businessProfile[field];
    const ambiguous =
      field === "service_area"
        ? !isEmpty(value) &&
          Array.isArray(value) &&
          value.length === 1 &&
          value[0] === businessProfile.city
        : false;
    if (ambiguous) {
      followUps.push({
        field,
        question: fieldFollowUp(questionnaire, field, businessProfile),
        tier: tierForField(questionnaire, field),
        hint: questionnaire.fields?.[field]?.label,
      });
    }
  }

  if (followUps.length < 3 && businessProfile.cta_preference === "whatsapp" && isEmpty(businessProfile.whatsapp_number)) {
    if (!followUps.some((q) => q.field === "whatsapp_number")) {
      followUps.push({
        field: "whatsapp_number",
        question: fieldFollowUp(questionnaire, "whatsapp_number", businessProfile),
        tier: "recommended",
        hint: "WhatsApp number",
      });
    }
  }

  if (followUps.length < 3 && businessProfile.cta_preference === "phone") {
    const phoneValue = businessProfile.phone ?? businessProfile.phone_number;
    if (isEmpty(phoneValue) && !followUps.some((q) => q.field === "phone")) {
      followUps.push({
        field: "phone",
        question: fieldFollowUp(questionnaire, "phone", businessProfile),
        tier: "recommended",
        hint: "Phone number",
      });
    }
  }

  if (followUps.length < 3 && isEmpty(businessProfile.email)) {
    const hasPhone =
      !isEmpty(businessProfile.phone) ||
      !isEmpty(businessProfile.phone_number) ||
      !isEmpty(businessProfile.whatsapp_number);
    const wantsForm = businessProfile.cta_preference === "form";
    const wantsNewsletter =
      businessProfile.cta_preference === "newsletter" ||
      businessProfile.cta_preference === "email";
    const wantsDemoOrTrial =
      businessProfile.cta_preference === "demo" ||
      businessProfile.cta_preference === "trial";
    if (
      (hasPhone || wantsForm || wantsNewsletter || wantsDemoOrTrial) &&
      !followUps.some((q) => q.field === "email")
    ) {
      followUps.push({
        field: "email",
        question: fieldFollowUp(questionnaire, "email", businessProfile),
        tier: "optional",
        hint: "Email address",
      });
    }
  }

  const OPTIONAL_SOCIAL_FIELDS = ["linkedin_id", "x_account"] as const;
  for (const field of OPTIONAL_SOCIAL_FIELDS) {
    if (followUps.length >= 3) break;
    if (!(field in (questionnaire.fields ?? {}))) continue;
    if (field in businessProfile) continue;
    if (followUps.some((q) => q.field === field)) continue;
    followUps.push({
      field,
      question: fieldFollowUp(questionnaire, field, businessProfile),
      tier: "optional",
      hint: questionnaire.fields?.[field]?.label,
    });
  }

  return GapCheckResponseSchema.parse({
    complete: followUps.length === 0,
    followUps: followUps.slice(0, 3),
  });
}

function regexPrefill(description: string, category: string, subcategory?: string): Record<string, unknown> {
  const text = description.trim();
  const inferred = inferTaxonomy(text);
  const out: Record<string, unknown> = {
    category,
    image_sourcing_mode: "ai_decide",
    language: "en",
  };

  if (subcategory) {
    out.subcategory = subcategory;
  } else if (inferred) {
    out.category = inferred.category;
    out.subcategory = inferred.subcategory;
  }

  const resolvedSubcategory =
    typeof out.subcategory === "string" ? out.subcategory : subcategory;
  const entityHint = inferEntityLabelFromDescription(text, resolvedSubcategory);
  if (entityHint) {
    out.entity_label = entityHint;
  }

  // Name / city / services / CTA / contact are asked in chat — never guessed here.
  return out;
}

/**
 * Fields the user must answer in chat (not auto-decided by prefill).
 */
const ASK_USER_FIELDS = [
  "business_name",
  "city",
  "tagline",
  "facility_type",
  "product_type",
  "studio_type",
  "services",
  "cta_preference",
  "service_area",
  "phone",
  "phone_number",
  "whatsapp_number",
  "email",
  "linkedin_id",
  "x_account",
  "tone_preference",
  "newsletter_cta",
] as const;

function themeModeFromDescription(description: string): "dark" | "light" | "toggle" | undefined {
  const text = description.trim();
  if (!text) return undefined;
  if (/\bdark\s*mode\s*toggle\b/i.test(text) || /\bdark\s*\/\s*light\b/i.test(text)) {
    return "toggle";
  }
  if (/\bdark\s*mode\b/i.test(text) || /\bdark\s*theme\b/i.test(text)) {
    return "dark";
  }
  if (/\blight\s*mode\b/i.test(text) || /\blight\s*theme\b/i.test(text)) {
    return "light";
  }
  return undefined;
}

function applyDescriptionHints(
  profile: Record<string, unknown>,
  description: string,
): Record<string, unknown> {
  const out = { ...profile };
  const themeMode = themeModeFromDescription(description);
  if (themeMode && isEmpty(out.theme_mode_preference)) {
    out.theme_mode_preference = themeMode;
  }
  return out;
}

/**
 * Keep taxonomy / image routing from prefill; drop profile answers so gap-check asks the user.
 */
function stripAskUserFields(profile: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...profile };
  for (const field of ASK_USER_FIELDS) {
    delete out[field];
  }
  return out;
}

function buildPrefillPrompt(
  description: string,
  category: string,
  subcategory: string | undefined,
  questionnaire: QuestionnaireConfig,
): string {
  const allowedFields = Object.keys(questionnaire.fields ?? {});
  return (
    "Extract business profile fields from a one-line business description.\n" +
    "Respond with JSON only. Plain text values — no HTML.\n" +
    `Allowed fields: ${allowedFields.join(", ")}\n` +
    `category: ${category}\n` +
    (subcategory ? `subcategory: ${subcategory}\n` : "") +
    `Description: ${description}\n\n` +
    'Example shape: {"business_name":"...","city":"...","services":["..."],"tone_preference":"local_trustworthy","cta_preference":"whatsapp"}'
  );
}

function applyEntityLabelHint(
  profile: Record<string, unknown>,
  description: string,
): Record<string, unknown> {
  if (typeof profile.entity_label === "string" && profile.entity_label.trim()) return profile;
  const subcategory = typeof profile.subcategory === "string" ? profile.subcategory : undefined;
  const hint = inferEntityLabelFromDescription(description, subcategory);
  return hint ? { ...profile, entity_label: hint } : profile;
}

function clampPrefill(raw: Record<string, unknown>, category: string, subcategory?: string): Record<string, unknown> {
  const resolvedCategory =
    typeof raw.category === "string" && raw.category.trim() ? String(raw.category) : category;
  const resolvedSubcategory =
    typeof raw.subcategory === "string" && raw.subcategory.trim()
      ? String(raw.subcategory)
      : subcategory;
  const merged = {
    ...raw,
    category: resolvedCategory,
    ...(resolvedSubcategory ? { subcategory: resolvedSubcategory } : {}),
    image_sourcing_mode: raw.image_sourcing_mode ?? "ai_decide",
    language: raw.language ?? "en",
  };
  const parsed = PrefillResponseSchema.parse(merged);
  return normalizeCountryInProfile({
    ...parsed,
    image_pack_refs: getImagePackRefsForProfile(parsed),
  });
}

export async function prefillIntake(input: {
  description: string;
  category: string;
  subcategory?: string;
}): Promise<{ profile: Record<string, unknown>; source: "llm" | "heuristic" }> {
  const categoryDoc = await categoriesRepo.get(input.category);
  const questionnaire = (categoryDoc?.questionnaireConfigJson as QuestionnaireConfig | undefined) ?? {
    fields: {},
  };

  const [provider, model] = loadOnboardingProvider();
  if (provider && model) {
    try {
      const prompt = buildPrefillPrompt(
        input.description,
        input.category,
        input.subcategory,
        questionnaire,
      );
      const rawText = await provider.generate(model, prompt, { jsonMode: true, timeoutS: 15 });
      const parsed = JSON.parse(rawText.replace(/^```(?:json)?\s*|\s*```$/g, "").trim()) as Record<
        string,
        unknown
      >;
      return {
        profile: applyDescriptionHints(
          applyEntityLabelHint(
            stripAskUserFields(clampPrefill(parsed, input.category, input.subcategory)),
            input.description,
          ),
          input.description,
        ),
        source: "llm",
      };
    } catch {
      /* fall through to heuristic */
    }
  }

  return {
    profile: applyDescriptionHints(
      applyEntityLabelHint(
        stripAskUserFields(
          clampPrefill(
            regexPrefill(input.description, input.category, input.subcategory),
            input.category,
            input.subcategory,
          ),
        ),
        input.description,
      ),
      input.description,
    ),
    source: "heuristic",
  };
}

export async function gapCheckForCategory(
  businessProfile: Record<string, unknown>,
  categoryId: string,
): Promise<z.infer<typeof GapCheckResponseSchema>> {
  const categoryDoc = await categoriesRepo.get(categoryId);
  if (!categoryDoc) {
    throw new Error(`unknown category: ${categoryId}`);
  }
  const baseQuestionnaire = (categoryDoc.questionnaireConfigJson as QuestionnaireConfig | undefined) ?? {
    required: [],
    fields: {},
  };
  const normalized = normalizeCountryInProfile(parseBusinessProfilePartial(businessProfile));
  const questionnaire = resolveQuestionnaireForProfile(baseQuestionnaire, normalized);
  return gapCheck(normalized, questionnaire);
}

// Test seams
export function gapCheckForTests(
  businessProfile: Record<string, unknown>,
  questionnaire: QuestionnaireConfig,
): z.infer<typeof GapCheckResponseSchema> {
  return gapCheck(normalizeCountryInProfile(businessProfile), questionnaire);
}

export function normalizeCountryInProfileForTests(
  profile: Record<string, unknown>,
): Record<string, unknown> {
  return normalizeCountryInProfile(profile);
}

export function isAmbiguousBusinessNameForTests(value: unknown): boolean {
  return isAmbiguousBusinessName(value);
}

export function regexPrefillForTests(
  description: string,
  category: string,
  subcategory?: string,
): Record<string, unknown> {
  return regexPrefill(description, category, subcategory);
}
