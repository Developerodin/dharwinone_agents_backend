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

type Item = Record<string, unknown>;
const asItems = (v: unknown): Item[] => (Array.isArray(v) ? (v as Item[]) : []);

/**
 * Map generator field aliases onto the canonical render schema (SiteContent):
 * faq {question,answer}->{q,a}, pricing {title,desc}->{name,features},
 * cta_footer {text}->{headline}, testimonials {image}->{avatar}. The model picks
 * natural names the templates don't read; this makes the persisted content
 * canonical regardless. Alias keys are dropped so the output is clean.
 */
function canonicalizeSection(key: string, section: unknown): unknown {
  if (!section || typeof section !== "object" || Array.isArray(section)) return section;
  const s = section as Record<string, unknown>;

  if (key === "faq" && Array.isArray(s.items)) {
    return {
      ...s,
      items: asItems(s.items).map(({ question, answer, ...rest }) => ({
        ...rest,
        q: rest.q ?? question,
        a: rest.a ?? answer,
      })),
    };
  }
  if (key === "pricing" && Array.isArray(s.items)) {
    return {
      ...s,
      items: asItems(s.items).map(({ title, desc, ...rest }) => ({
        ...rest,
        name: rest.name ?? title,
        features: rest.features ?? (desc != null ? [desc] : undefined),
      })),
    };
  }
  if (key === "cta_footer" && s.headline == null && s.text != null) {
    const { text, ...rest } = s;
    return { ...rest, headline: text };
  }
  if (key === "testimonials" && Array.isArray(s.items)) {
    return {
      ...s,
      items: asItems(s.items).map(({ image, ...rest }) => ({ ...rest, avatar: rest.avatar ?? image })),
    };
  }
  return section;
}

function canonicalizeContent(content: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(content)) out[key] = canonicalizeSection(key, value);
  return out;
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

function profileString(bp: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const v = bp[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function formatPhoneDisplay(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return trimmed;
  if (trimmed.startsWith("+")) return trimmed;
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  return `+${digits}`;
}

/** Stamp intake contact fields into content.contact so persisted JSON is complete. */
function injectContactFromProfile(
  content: Record<string, unknown>,
  businessProfile: Record<string, unknown>,
): Record<string, unknown> {
  const existing = (content.contact as Record<string, unknown> | undefined) ?? {};
  const contact = { ...existing };

  const phone = profileString(businessProfile, "whatsapp_number", "phone", "phone_number");
  if (phone) contact.phone = formatPhoneDisplay(phone);

  const email = profileString(businessProfile, "email", "contact_email");
  if (email) contact.email = email;

  const address = profileString(
    businessProfile,
    "address",
    "business_address",
    "service_area",
  );
  const city = profileString(businessProfile, "city");
  if (address) contact.address = address;
  else if (city) contact.address = city;

  if (Object.keys(contact).length > 0) content.contact = contact;
  return content;
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

  return { content: injectContactFromProfile(canonicalizeContent(out), businessProfile), usedFallback };
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
    return canonicalizeSection(input.sectionKey, objectSchema.parse(JSON.parse(raw))) as Record<
      string,
      unknown
    >;
  } catch {
    return input.currentSection;
  }
}
