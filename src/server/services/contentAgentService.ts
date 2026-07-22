/** Phase 1 content agent — structured JSON only, no code generation. */
import { z } from "zod";
import { loadOnboardingProvider } from "../llmProvider";

/** Sections the prompt actually requests and we guarantee in the output. */
const REQUIRED_SECTIONS = ["hero", "services", "seo"] as const;

function buildPrompt(
  businessProfile: Record<string, unknown>,
  sectionSchema: Record<string, unknown>,
): string {
  return (
    "Generate website section content as JSON only. Plain text fields — no HTML/markdown.\n" +
    "Respect maxLength/maxItems from the schema.\n" +
    "Write ALL content in the same language and script as the business_profile input — see its " +
    '`language` field and free-text `description`. If the input mixes languages (e.g. Hinglish), ' +
    "mirror that exact style; do not translate to English.\n\n" +
    `business_profile:\n${JSON.stringify(businessProfile)}\n\n` +
    `section_schema:\n${JSON.stringify(sectionSchema)}\n\n` +
    "Produce a top-level key for EVERY section listed in section_schema.sections, " +
    "each shaped as its section_schema.schema entry, plus a `seo` object " +
    "({title, description}). Omit a section only if it is truly irrelevant to this " +
    "business. Example shape: {\"hero\": {...}, \"services\": {...}, \"faq\": {...}, \"seo\": {...}}"
  );
}

// ponytail: regex plain-text coercion, not a real HTML/markdown parser.
function toPlainText(raw: string): string {
  let s = raw;
  s = s.replace(/<[^>]+>/g, " "); // strip HTML tags
  s = s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1"); // markdown links/images -> text
  s = s.replace(/[*_`~]+/g, ""); // emphasis / code markers
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, ""); // heading markers
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'");
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Recursively clamp `value` against a template `section_schema` descriptor:
 * strings are coerced to plain text and clamped to `maxLength`; arrays are
 * truncated to `maxItems`/`maxCount` and each element recursed against `item`.
 * Descriptor may be undefined (unknown key) — strings are still plain-texted.
 */
function clampValue(value: unknown, descriptor: unknown): unknown {
  if (typeof value === "string") {
    let s = toPlainText(value);
    const maxLength = (descriptor as { maxLength?: unknown } | undefined)?.maxLength;
    if (typeof maxLength === "number") s = s.slice(0, maxLength);
    return s;
  }
  if (Array.isArray(value)) {
    const desc = descriptor as { item?: unknown; maxItems?: unknown; maxCount?: unknown } | undefined;
    let items = value;
    const max = desc?.maxItems ?? desc?.maxCount;
    if (typeof max === "number") items = items.slice(0, max);
    return items.map((v) => clampValue(v, desc?.item));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    const desc = descriptor as Record<string, unknown> | undefined;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = clampValue(child, desc?.[key]);
    }
    return out;
  }
  return value;
}

function isValidSection(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length > 0
  );
}

function businessName(businessProfile: Record<string, unknown>): string {
  const name = businessProfile.business_name;
  return typeof name === "string" && name.trim() ? name.trim() : "Your Business";
}

/** Per-section template default content — used to fill missing/invalid sections. */
function defaultSection(key: string, name: string): Record<string, unknown> | null {
  switch (key) {
    case "hero":
      return {
        headline: `${name} — trusted local service`,
        subtext: "Professional service you can count on.",
        cta_text: "Contact us",
      };
    case "services":
      return { items: [{ title: "Core service", desc: "Quality work, fair pricing." }] };
    case "seo":
      return { title: name, description: `Learn more about ${name}.` };
    default:
      return null;
  }
}

/**
 * Clamp every section the model produced, then guarantee the required sections
 * exist — filling only the missing/invalid ones from per-section defaults.
 * `usedFallback` is true only if at least one section actually fell back.
 */
function assembleContent(
  modelContent: Record<string, unknown>,
  businessProfile: Record<string, unknown>,
  sectionSchema: Record<string, unknown>,
): { content: Record<string, unknown>; usedFallback: boolean } {
  const schema = (sectionSchema.schema as Record<string, unknown> | undefined) ?? {};
  const name = businessName(businessProfile);
  const out: Record<string, unknown> = {};
  let usedFallback = false;

  // Preserve any extra (non-required) sections the model produced, clamped.
  for (const [key, value] of Object.entries(modelContent)) {
    if ((REQUIRED_SECTIONS as readonly string[]).includes(key)) continue;
    out[key] = clampValue(value, schema[key]);
  }

  for (const key of REQUIRED_SECTIONS) {
    // seo is always required; hero/services only when the schema declares them.
    if (key !== "seo" && !schema[key]) continue;
    const value = modelContent[key];
    if (isValidSection(value)) {
      out[key] = clampValue(value, schema[key]);
    } else {
      const fallback = defaultSection(key, name);
      if (fallback) {
        out[key] = fallback;
        usedFallback = true;
      }
    }
  }

  return { content: out, usedFallback };
}

function missingSections(
  content: Record<string, unknown>,
  sectionSchema: Record<string, unknown>,
): string[] {
  const schema = (sectionSchema.schema as Record<string, unknown> | undefined) ?? {};
  const missing: string[] = [];
  for (const key of REQUIRED_SECTIONS) {
    if (key !== "seo" && !schema[key]) continue;
    if (!isValidSection(content[key])) missing.push(key);
  }
  return missing;
}

const objectSchema = z.record(z.string(), z.unknown());

export async function generateSiteContent(input: {
  businessProfile: Record<string, unknown>;
  sectionSchema: Record<string, unknown>;
}): Promise<{ content: Record<string, unknown>; usedFallback: boolean }> {
  const [provider, model] = loadOnboardingProvider();
  if (!provider || !model) {
    return assembleContent({}, input.businessProfile, input.sectionSchema);
  }

  let lastErr = "";
  let bestContent: Record<string, unknown> = {};
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const prompt =
        attempt === 0
          ? buildPrompt(input.businessProfile, input.sectionSchema)
          : `${buildPrompt(input.businessProfile, input.sectionSchema)}\n\nPrevious validation error: ${lastErr}`;
      const raw = await provider.generate(model, prompt, { jsonMode: true, timeoutS: 20 });
      const parsed = objectSchema.parse(JSON.parse(raw));
      bestContent = parsed;
      const missing = missingSections(parsed, input.sectionSchema);
      if (missing.length === 0) break;
      lastErr = `Missing or invalid sections: ${missing.join(", ")}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }

  // Clamp what the model gave us; fill only the still-missing sections from defaults.
  return assembleContent(bestContent, input.businessProfile, input.sectionSchema);
}

export async function regenerateSection(input: {
  sectionKey: string;
  currentSection: Record<string, unknown>;
  instruction?: string;
  businessProfile: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const [provider, model] = loadOnboardingProvider();
  if (!provider || !model) return input.currentSection;

  const prompt =
    "Rewrite this website section JSON. Same shape, plain text only.\n" +
    `Section key: ${input.sectionKey}\n` +
    `Instruction: ${input.instruction ?? "Improve clarity and tone"}\n` +
    `business_profile: ${JSON.stringify(input.businessProfile)}\n` +
    `current: ${JSON.stringify(input.currentSection)}\n` +
    "Respond with JSON for the section object only.";
  try {
    const raw = await provider.generate(model, prompt, { jsonMode: true, timeoutS: 15 });
    return objectSchema.parse(JSON.parse(raw));
  } catch {
    return input.currentSection;
  }
}
