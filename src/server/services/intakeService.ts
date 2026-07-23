/** Smart intake — AI prefill + rule-based gap-check (Phase 1 M1). */
import { z } from "zod";
import { getImagePackRefsForProfile, inferTaxonomy } from "../data/categoryCatalog";
import * as categoriesRepo from "../repos/categoriesRepo";
import { loadOnboardingProvider } from "../llmProvider";
import {
  parseBusinessProfilePartial,
  GapCheckResponseSchema,
  PrefillResponseSchema,
  type QuestionnaireConfig,
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
  if (field === "services") {
    return "Which specific services should we highlight on your site?";
  }
  if (field === "business_name") {
    return "What's the name of your business? This appears on your site header and contact sections.";
  }
  if (field === "cta_preference") {
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

function tierForField(config: QuestionnaireConfig, field: string): "required" | "recommended" | "optional" {
  if (config.required?.includes(field)) return "required";
  if (config.recommended?.includes(field)) return "recommended";
  return (config.fields?.[field]?.tier as "required" | "recommended" | "optional") ?? "optional";
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
    const value = businessProfile[field];
    const missing = isEmpty(value);
    const ambiguous =
      field === "services"
        ? isAmbiguousServices(value)
        : field === "business_name"
          ? isAmbiguousBusinessName(value)
          : field === "service_area"
            ? !missing && Array.isArray(value) && value.length === 1 && value[0] === businessProfile.city
            : false;

    if (missing || ambiguous) {
      followUps.push({
        field,
        question: fieldFollowUp(questionnaire, field, businessProfile),
        tier: tierForField(questionnaire, field),
        hint: questionnaire.fields?.[field]?.label,
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

  const nameMatch = /(?:called|named)\s+([A-Za-z][\w\s&'-]{1,40})/i.exec(text);
  if (nameMatch) {
    out.business_name = nameMatch[1]!.trim().replace(/[ .,]+$/, "");
  }

  const cityMatch = /\b(?:in|at|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/.exec(text);
  if (cityMatch) {
    out.city = cityMatch[1]!.trim();
    out.service_area = [cityMatch[1]!.trim()];
  }

  const serviceParts = text
    .split(/,|\band\b|\//i)
    .map((p) => p.trim())
    .filter((p) => p.length > 3 && p.length < 60);

  const resolvedSubcategory = String(out.subcategory ?? "");
  if ((resolvedSubcategory === "cafe" || resolvedSubcategory === "restaurant") && !out.services) {
    const offerings: string[] = [];
    if (/\bmenu\b/i.test(text)) offerings.push("Menu");
    if (/\breserv/i.test(text)) offerings.push("Reservations");
    if (/\blocation\b/i.test(text)) offerings.push("Location & directions");
    out.services =
      offerings.length > 0
        ? offerings
        : serviceParts.length >= 2
          ? serviceParts.slice(0, 6)
          : ["Dining", "Takeaway"];
  } else if (serviceParts.length >= 2) {
    out.services = serviceParts.slice(0, 6);
  } else if (resolvedSubcategory === "electrician" && !out.services) {
    out.services = ["wiring", "AC repair", "emergency callout"];
  } else if (resolvedSubcategory === "plumbing" && !out.services) {
    out.services = ["pipe repair", "leak fixing", "bathroom fitting"];
  }

  if (/whatsapp/i.test(text)) out.cta_preference = "whatsapp";
  else if (/call|phone/i.test(text)) out.cta_preference = "phone";

  if (/trust|local|reliable/i.test(text)) out.tone_preference = "local_trustworthy";
  else if (/premium|professional/i.test(text)) out.tone_preference = "professional";

  if (!out.business_name) {
    const firstChunk = text.split(/[.,]/)[0]?.trim();
    if (firstChunk && firstChunk.length <= 60 && !isAmbiguousBusinessName(firstChunk)) {
      out.business_name = firstChunk;
    }
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
  return {
    ...parsed,
    image_pack_refs: getImagePackRefsForProfile(parsed),
  };
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
        profile: clampPrefill(parsed, input.category, input.subcategory),
        source: "llm",
      };
    } catch {
      /* fall through to heuristic */
    }
  }

  return {
    profile: clampPrefill(
      regexPrefill(input.description, input.category, input.subcategory),
      input.category,
      input.subcategory,
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
  const questionnaire = (categoryDoc.questionnaireConfigJson as QuestionnaireConfig | undefined) ?? {
    required: [],
    fields: {},
  };
  const normalized = parseBusinessProfilePartial(businessProfile);
  return gapCheck(normalized, questionnaire);
}

// Test seams
export function gapCheckForTests(
  businessProfile: Record<string, unknown>,
  questionnaire: QuestionnaireConfig,
): z.infer<typeof GapCheckResponseSchema> {
  return gapCheck(businessProfile, questionnaire);
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
