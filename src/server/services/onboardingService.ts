/** Conversational onboarding — port of studio/services/onboarding_service.py */

import { pickTemplate } from "../draft";
import { disableLlmBriefly, loadOnboardingProvider } from "../llmProvider";
import * as conversationsRepo from "../repos/conversationsRepo";
import * as profilesRepo from "../repos/profilesRepo";
import * as projectsRepo from "../repos/projectsRepo";
import { computeCompleteness, isMultiPlaceValue } from "./profileService";

const QUESTIONS: Record<string, string> = {
  "business.type":
    "What kind of website are we building (coffee shop, portfolio, agency, online store, etc.)?",
  "brand.brandName": "Great. What should we call your brand on the site?",
  "business.services": "What are the main services or products you want highlighted?",
  "business.description":
    "What should the intro line on your homepage say? One or two lines about what you offer.",
  "business.targetAudience": "Who are your ideal customers?",
  "location.country": "Which country should we show for your business location?",
  "location.city": "And which city should we mention?",
};

const FIELD_HINTS: Record<string, string> = {
  "business.type": 'For example: "coffee shop", "fitness app", or "photography portfolio".',
  "brand.brandName": "It's the name visitors will see in the site header.",
  "business.services": 'For example: "photo editing, filters, one-click exports".',
  "business.description": "It appears right under the big headline on your homepage.",
  "business.targetAudience": 'For example: "beginner photographers and content creators".',
  "location.country": "It appears in your contact section.",
  "location.city": "It appears in your contact section.",
};

const GENERATE_INTENT_RE =
  /\b(generate(?:\s+templates?)?|go\s+ahead|please\s+do|do\s+it|proceed|start(?:\s+generation)?|build\s+it|create\s+it|ship\s+it)\b/i;
const CLARIFY_REQUEST_RE =
  /\bi\s+(?:really\s+)?(?:don'?t|do\s+not|didn'?t)\s+(?:understand|get|follow)\b|what\s+(?:do\s+you\s+mean|are\s+you\s+asking|does\s+(?:that|this|it)\s+mean)|(?:can|could)\s+you\s+(?:elaborate|explain|clarify|rephrase)|please\s+(?:elaborate|explain|clarify)|\b(?:i'?m|i\s+am)\s+(?:so\s+)?confused\b|\b(?:i'?m|i\s+am|i)\s+not\s+sure\s+what\b/i;
const SKIP_REQUEST_RE =
  /\bskip\b|\b(?:add|do|fill|provide|give)\s+(?:it|this|that)?\s*later\b|\bnot\s+(?:now|yet)\b|\bi\s+don'?t\s+have\s+(?:an?y?\s+)?(?:email|phone|number|website|one|it)\b|\bno\s+(?:email|phone|number)\b/i;
const EXAMPLES_REQUEST_RE =
  /\b(?:more|other|another|different|new|some)\s+(?:example|option|suggestion|alternative)s?\b|\b(?:show|give|suggest|list)\s+(?:me\s+)?(?:some\s+)?(?:more\s+)?(?:example|option|alternative)s?\b|\bsomething\s+(?:classy|elegant|professional|premium|minimal|catchy|better|aggressive|fiery|bold|edgy|playful)\b|\bdo\s+you\s+have\b.*\b(?:example|option)s?\b/i;
const ACCEPT_EXAMPLE_RE =
  /\b(?:use|pick|take|go\s+with|choose)\s+(?:it|that|this|the\s+example|the\s+suggested)\b|\b(?:like|love|prefer)\s+(?:it|that|this|the\s+example|the\s+suggested)\b|\b(?:that|this)\s+one\b|\b(?:use|with)\s+the\s+example\b|\bexample\s+(?:is\s+)?(?:fine|good|great|perfect|works)\b|\bsounds?\s+good\b|\bworks?\s+for\s+me\b|\bi\s+like\s+(?:it|that|this|the\s+example)\b|\bjust\s+use\s+(?:it|that|this)\b/i;
const STYLE_DIRECTIVE_RE =
  /^(?:please\s+)?(?:make|keep)\b.*\b(?:minim\w+|sleek|clean|modern|simple|elegant|premium|bold|dark|light)\b/i;
const LEGACY_CONTACT_PROMPT_RE =
  /(what\s+email\s+address\s+would\s+you\s+like\s+people\s+to\s+use)|(what\s+phone\s+number\s+would\s+you\s+like\s+us\s+to\s+show)/i;
const GENERIC_PROMPT_RE =
  /^(?:create|build|make|design)\s+(?:a\s+)?(?:website|site|web\s*page|landing\s*page)|^(?:i\s+)?(?:want|need)\s+(?:a\s+)?(?:website|site)/i;
const INITIAL_VERB_RE =
  /^(?:please\s+)?(?:create|build|make|design|i\s+(?:want|need))\s+(?:an?\s+)?/i;
const INITIAL_WITH_RE =
  /^(?:an?\s+)?([a-z][a-z\s&/-]{2,40}?)\s+(?:website|site|page)\s+with\s+(.+)$/i;

const ROUTE_INTENTS = new Set([
  "answer",
  "clarify",
  "style",
  "skip",
  "other",
  "request_examples",
]);

const DEFAULT_AUDIENCES: Record<string, string> = {
  cafe: "Locals, families, and food lovers nearby",
  shop: "Shoppers looking for quality products",
  medical: "Patients and families seeking trusted care nearby",
  fitness: "People who want to get fit with expert guidance",
  education: "Students and parents exploring programs",
  construction: "Homeowners and businesses planning projects",
  travel: "Travelers planning their next trip",
  portfolio: "Potential clients and collaborators",
  agency: "Businesses looking to grow their brand",
  saas: "Teams that want to streamline their work",
};

type RouteResult = { intent: string; value: string | null };
type Confidence = "high" | "medium" | "low";

function getNested(profile: Record<string, unknown>, path: string): unknown {
  let cur: unknown = profile;
  for (const part of path.split(".")) {
    cur = typeof cur === "object" && cur !== null ? (cur as Record<string, unknown>)[part] : null;
    if (cur == null) return null;
  }
  return cur;
}

function setNested(profile: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur = profile;
  for (const part of parts.slice(0, -1)) {
    if (typeof cur[part] !== "object" || cur[part] === null) cur[part] = {};
    cur = cur[part] as Record<string, unknown>;
  }
  cur[parts.at(-1)!] = value;
}

function servicesForExample(profile: Record<string, unknown>): string[] {
  const raw = getNested(profile, "business.services");
  const items: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const s = String(item).trim().replace(/[ .,]+$/, "");
      if (s) items.push(s);
    }
  } else if (typeof raw === "string") {
    for (const part of raw.split(/,|\/|\band\b/i)) {
      const s = part.trim().replace(/[ .,]+$/, "");
      if (s) items.push(s);
    }
  }
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    deduped.push(item);
    seen.add(key);
  }
  return deduped.slice(0, 2);
}

function descriptionExample(profile: Record<string, unknown>): string {
  const brand = String(getNested(profile, "brand.brandName") ?? "").trim().replace(/[ .,]+$/, "");
  const businessType = String(getNested(profile, "business.type") ?? "").trim().replace(/[ .,]+$/, "");
  const services = servicesForExample(profile);
  const servicesText =
    services.length === 2 ? `${services[0]} and ${services[1]}` : services[0] ?? "";
  if (brand && servicesText) return `For example: "${brand} helps you improve with ${servicesText}."`;
  if (servicesText && businessType) return `For example: "A ${businessType} focused on ${servicesText}."`;
  if (servicesText) return `For example: "We offer ${servicesText} with clear, practical guidance."`;
  if (brand && businessType) return `For example: "${brand} is a ${businessType} built for real results."`;
  if (brand) return `For example: "${brand} helps customers get better outcomes, faster."`;
  return 'For example: "We help customers solve their goals with simple, reliable service."';
}

function questionFor(profile: Record<string, unknown>, path: string): string {
  const base = QUESTIONS[path]!;
  if (path === "business.description") return `${base} ${descriptionExample(profile)}`;
  if (path === "location.country") return `${base} For example: "India".`;
  return base;
}

function nextQuestion(profile: Record<string, unknown>): [string | null, string | null] {
  const skipped = new Set((profile.skipped as string[] | undefined) ?? []);
  for (const path of Object.keys(QUESTIONS)) {
    if (skipped.has(path)) continue;
    const val = getNested(profile, path);
    if (path === "location.city") {
      const country = getNested(profile, "location.country");
      if (isMultiPlaceValue(country)) continue;
    }
    if (path === "business.services") {
      if (!val || (Array.isArray(val) && val.length === 0)) {
        return [questionFor(profile, path), path];
      }
    } else if (!val) {
      return [questionFor(profile, path), path];
    }
  }
  return [null, null];
}

function extractInitialRegex(text: string): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const cleaned = text.trim().replace(INITIAL_VERB_RE, "");
  const m = INITIAL_WITH_RE.exec(cleaned);
  if (m) {
    fields["business.type"] = m[1]!.trim();
    const services = m[2]!
      .split(/,|\band\b/i)
      .map((p) => p.trim().replace(/[ .]+$/, ""))
      .filter((p) => p.length > 2);
    if (services.length) fields["business.services"] = services;
  }
  const nameM = /(?:called|named)\s+([A-Za-z][\w\s&'-]{1,40})/i.exec(text);
  if (nameM) {
    const name = nameM[1]!.trim().replace(/[ .,]+$/, "");
    if (name.split(/\s+/).length <= 6) fields["brand.brandName"] = name;
  }
  return fields;
}

function extractInitial(text: string): Record<string, unknown> {
  // ponytail: regex-only initial extract; LLM initial parse deferred
  return extractInitialRegex(text);
}

function extract(message: string, fieldPath: string, profile?: Record<string, unknown>): [unknown, Confidence] {
  const text = message.trim();
  const low = text.toLowerCase();

  if (fieldPath === "brand.brandName") {
    if (GENERIC_PROMPT_RE.test(text)) return [null, "low"];
    if (text.split(/\s+/).length <= 4) return [text.replace(/\.$/, ""), "medium"];
    return [text.replace(/\.$/, ""), "medium"];
  }
  if (fieldPath === "business.type") {
    if (GENERIC_PROMPT_RE.test(text)) return [null, "low"];
    if (text.split(/\s+/).length >= 2) return [text.replace(/\.$/, ""), "high"];
    return [text.replace(/\.$/, ""), "medium"];
  }
  if (fieldPath === "business.services") {
    const services = text
      .split(/,|\band\b/i)
      .map((p) => p.trim().replace(/[ .]+$/, ""))
      .filter((p) => p.length > 2);
    return services.length ? [services, "high"] : [null, "low"];
  }
  if (fieldPath === "business.description" || fieldPath === "business.targetAudience") {
    return [text.replace(/\.$/, ""), "high"];
  }
  if (fieldPath === "location.country" || fieldPath === "location.city") {
    // ponytail: simplified location parsing; LLM location extract deferred
    const parts = text.split(/,|\band\b/i).map((p) => p.trim().replace(/[ .]+$/, "")).filter(Boolean);
    if (fieldPath === "location.country" && parts.length >= 2 && profile) {
      const city = parts[0]!;
      if (!getNested(profile, "location.city")) setNested(profile, "location.city", city);
      return [parts.at(-1)!, "high"];
    }
    return [text.replace(/\.$/, ""), "high"];
  }
  return text ? [text.replace(/\.$/, ""), "medium"] : [null, "low"];
}

function mergeField(
  profile: Record<string, unknown>,
  fieldPath: string,
  value: unknown,
  confidence: Confidence,
): [Record<string, unknown>, boolean] {
  if (value == null) return [profile, false];
  if (fieldPath === "business.services" && Array.isArray(value) && !value.length) return [profile, false];
  const current = getNested(profile, fieldPath);
  if (current && confidence === "low") return [profile, false];
  setNested(profile, fieldPath, value);
  return [profile, true];
}

function prefillDefaults(profile: Record<string, unknown>): void {
  if (getNested(profile, "business.targetAudience")) return;
  const btype = getNested(profile, "business.type");
  if (!btype) return;
  const services = getNested(profile, "business.services");
  const genre = pickTemplate([String(btype), ...(Array.isArray(services) ? services.map(String) : [])].join(" "));
  const defaultAudience = DEFAULT_AUDIENCES[genre];
  if (defaultAudience) setNested(profile, "business.targetAudience", defaultAudience);
}

function friendlyQuestion(question: string | null, percent: number): string {
  if (!question) return "Tell me a bit more about your business.";
  if (percent >= 80) return `Awesome, almost done. ${question}`;
  if (percent >= 40) return `Perfect. ${question}`;
  return question;
}

function acceptsExample(message: string): boolean {
  return ACCEPT_EXAMPLE_RE.test(message);
}

function exampleValueForField(profile: Record<string, unknown>, fieldPath: string): string | null {
  if (fieldPath === "business.description") {
    const m = /"([^"]+)"/.exec(descriptionExample(profile));
    return m?.[1]?.trim().replace(/\.$/, "") ?? null;
  }
  if (fieldPath === "location.country") return "India";
  return null;
}

function requestsMoreExamples(message: string): boolean {
  return EXAMPLES_REQUEST_RE.test(message);
}

function descriptionExampleVariants(profile: Record<string, unknown>, styleHint = ""): string[] {
  const brand = String(getNested(profile, "brand.brandName") ?? "").trim().replace(/[ .,]+$/, "");
  const businessType = String(getNested(profile, "business.type") ?? "").trim().replace(/[ .,]+$/, "");
  const services = servicesForExample(profile);
  const servicesText =
    services.length === 2 ? `${services[0]} and ${services[1]}` : services[0] ?? "";
  const hint = styleHint.toLowerCase();
  const polished = /classy|elegant|professional|premium/.test(hint);
  const fiery = /aggressive|fiery|bold|edgy/.test(hint);
  const variants: string[] = [];
  if (brand && servicesText) {
    if (fiery) variants.push(`${brand} — ignite your grind with ${servicesText}.`);
    else if (polished) variants.push(`${brand} delivers refined ${servicesText} with expert care.`);
    else variants.push(`${brand} helps you improve with ${servicesText}.`);
  } else if (servicesText && businessType) {
    variants.push(`A ${businessType} focused on ${servicesText}.`);
  } else if (brand) {
    variants.push(`${brand} helps customers get better outcomes, faster.`);
  } else {
    variants.push("We help customers solve their goals with simple, reliable service.");
  }
  return [...new Set(variants)].slice(0, 3);
}

function exampleStyleHint(message: string): string {
  const low = message.toLowerCase();
  const words = [
    "classy",
    "elegant",
    "professional",
    "premium",
    "minimal",
    "catchy",
    "bold",
    "aggressive",
    "fiery",
    "edgy",
    "playful",
  ];
  return words.filter((w) => low.includes(w)).join(", ");
}

function formatExamplesResponse(
  profile: Record<string, unknown>,
  fieldPath: string,
  userMessage?: string,
): string {
  const examples =
    fieldPath === "business.description"
      ? descriptionExampleVariants(profile, exampleStyleHint(userMessage ?? ""))
      : [];
  if (!examples.length) {
    return `No problem. ${questionFor(profile, fieldPath)} ${FIELD_HINTS[fieldPath] ?? ""}`.trim();
  }
  const lines = ["Here are a few options:"];
  examples.forEach((ex, i) => lines.push(`${i + 1}. "${ex}"`));
  lines.push("Pick one or tell me your own.");
  return lines.join("\n");
}

function cleanModelText(text: string): string {
  let msg = (text || "").trim();
  if (!msg) return "";
  msg = msg.split(/\r?\n/)[0]!.trim().replace(/^[`"'*-•\s]+/, "").replace(/\s+/g, " ");
  return msg.length > 220 ? msg.slice(0, 220).trim() : msg;
}

function businessContext(profile: Record<string, unknown>): string {
  const brand = getNested(profile, "brand.brandName");
  const btype = getNested(profile, "business.type");
  const city = getNested(profile, "location.city");
  const country = getNested(profile, "location.country");
  const parts: string[] = [];
  if (brand) parts.push(`brand "${String(brand).slice(0, 60)}"`);
  if (btype) parts.push(`a ${String(btype).slice(0, 60)} business`);
  const where = [city, country].filter(Boolean).map(String).join(", ");
  if (where) parts.push(`based in ${where.slice(0, 120)}`);
  return parts.join(", ");
}

async function llmPhrase(
  kind: string,
  fallbackText: string,
  userMessage?: string,
  profile?: Record<string, unknown>,
): Promise<string | null> {
  const [provider, model] = loadOnboardingProvider();
  if (!provider || !model) return null;
  const context = profile ? businessContext(profile) : "";
  const prompt =
    "Rewrite the following website-builder assistant line to sound natural and human.\n" +
    `Mode: ${kind}\n` +
    (context ? `Known business: ${context}\n` : "") +
    `Last user message: ${String(userMessage ?? "").slice(0, 140)}\n` +
    `Original line: ${fallbackText}\n\n` +
    "Rules:\n- Keep the original intent exactly.\n- Keep it one sentence, max 22 words.\n- Plain text only.";
  try {
    const out = await provider.generate(model, prompt, { numCtx: 2048, timeoutS: 20 });
    const msg = cleanModelText(out);
    if (!msg) return null;
    if (kind === "ready_trigger" && !/generat|template|build|kicking off|starting/i.test(msg)) return null;
    if (kind === "ask_services" && !msg.includes("?")) return null;
    if ((kind === "clarify" || kind === "ask_next") && fallbackText.includes("?") && !msg.includes("?")) {
      return null;
    }
    return msg;
  } catch {
    disableLlmBriefly();
    return null;
  }
}

async function llmRoute(
  message: string,
  targetField: string | null,
  profile: Record<string, unknown>,
): Promise<RouteResult | null> {
  if (!targetField) return null;
  const [provider, model] = loadOnboardingProvider();
  if (!provider || !model) return null;
  const question = QUESTIONS[targetField] ?? "";
  const context = businessContext(profile);
  const prompt =
    "You route user messages in a website-builder onboarding chat.\n" +
    `Question the assistant just asked: "${question}"\n` +
    `Field being collected: ${targetField}\n` +
    (context ? `Known business: ${context}\n` : "") +
    `User message: ${message.slice(0, 300)}\n\n` +
    'Return JSON only: {"intent": "answer"|"clarify"|"style"|"skip"|"request_examples"|"other", "value": string|null}\n' +
    "Rules:\n- Never invent an answer. Keep value under 40 words.";
  try {
    const out = await provider.generate(model, prompt, { jsonMode: true, numCtx: 2048, timeoutS: 15 });
    const raw = out.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const data = JSON.parse(raw) as { intent?: string; value?: unknown };
    if (!data.intent || !ROUTE_INTENTS.has(data.intent)) return null;
    const value = typeof data.value === "string" && data.value.trim() ? data.value.trim() : null;
    return { intent: data.intent, value };
  } catch {
    disableLlmBriefly();
    return null;
  }
}

async function readyReply(
  message: string,
  profile: Record<string, unknown>,
): Promise<[string, string]> {
  if (GENERATE_INTENT_RE.test(message)) {
    const fallback = "Perfect, kicking off personalized template generation now.";
    const llm = await llmPhrase("ready_trigger", fallback, message, profile);
    return [llm ?? fallback, "trigger_generate"];
  }
  const fallback =
    "Great, your profile is complete. I can generate personalized templates when you say go ahead, or we can refine details first.";
  const llm = await llmPhrase("ready_waiting", fallback, message, profile);
  return [llm ?? fallback, "ready_to_generate"];
}

function baseResponse(
  assistant: string,
  profile: Record<string, unknown>,
  ready = false,
  startGeneration = false,
): Record<string, unknown> {
  return {
    assistantMessage: assistant,
    completeness: profile.completeness,
    readyToGenerate: ready,
    startGeneration,
  };
}

export async function getChat(projectId: string): Promise<{ turns: conversationsRepo.Turn[] }> {
  const turns = await conversationsRepo.listTurns(projectId);
  return {
    turns: turns.filter(
      (turn) =>
        !(
          turn.role === "assistant" &&
          LEGACY_CONTACT_PROMPT_RE.test(String(turn.text ?? ""))
        ),
    ),
  };
}

export async function handleMessage(
  projectId: string,
  message: string,
): Promise<Record<string, unknown>> {
  if (!(await projectsRepo.get(projectId))) throw new Error("project not found");
  let profile: Record<string, unknown> = await profilesRepo.get(projectId);
  await conversationsRepo.appendTurn(projectId, "user", message);

  let mergedInitial = false;
  if (!getNested(profile, "business.type")) {
    for (const [path, value] of Object.entries(extractInitial(message))) {
      const [, didMerge] = mergeField(profile, path, value, "high");
      mergedInitial = mergedInitial || didMerge;
    }
  }

  prefillDefaults(profile);
  let targetField: string | null = null;
  if (!mergedInitial) [, targetField] = nextQuestion(profile);

  const route = await llmRoute(message, targetField, profile);
  const intent = route?.intent ?? null;

  if (targetField && acceptsExample(message)) {
    const exampleValue = exampleValueForField(profile, targetField);
    if (exampleValue) {
      const [, merged] = mergeField(profile, targetField, exampleValue, "high");
      if (merged) targetField = null;
    }
  }

  if (targetField?.startsWith("location.")) {
    const [value, confidence] = extract(message, targetField, profile);
    if (value != null && confidence !== "low") {
      const [, merged] = mergeField(profile, targetField, value, confidence);
      if (merged) targetField = null;
    }
  }

  if (targetField && (intent === "request_examples" || requestsMoreExamples(message))) {
    const assistant = formatExamplesResponse(profile, targetField, message);
    await conversationsRepo.appendTurn(projectId, "assistant", assistant, {
      intent: `examples_${targetField}`,
    });
    computeCompleteness(profile);
    await profilesRepo.save(profile as profilesRepo.ProfileDoc);
    return baseResponse(assistant, profile);
  }

  if (targetField && (intent === "clarify" || (!route && CLARIFY_REQUEST_RE.test(message)))) {
    const assistant = `No problem. ${questionFor(profile, targetField)} ${FIELD_HINTS[targetField] ?? ""}`.trim();
    await conversationsRepo.appendTurn(projectId, "assistant", assistant, {
      intent: `explain_${targetField}`,
    });
    computeCompleteness(profile);
    await profilesRepo.save(profile as profilesRepo.ProfileDoc);
    return baseResponse(assistant, profile);
  }

  if (
    targetField &&
    (intent === "style" || (!route && targetField === "business.description" && STYLE_DIRECTIVE_RE.test(message))) &&
    !requestsMoreExamples(message)
  ) {
    const existing = getNested(profile, "design.stylePreference");
    let pref = message.trim();
    if (existing && !String(existing).toLowerCase().includes(pref.toLowerCase())) {
      pref = `${existing}; ${pref}`;
    }
    setNested(profile, "design.stylePreference", pref);
    computeCompleteness(profile);
    await profilesRepo.save(profile as profilesRepo.ProfileDoc);
    const assistant = `Noted — I'll keep the design that way. ${questionFor(profile, targetField)}`;
    await conversationsRepo.appendTurn(projectId, "assistant", assistant, { intent: "style_preference" });
    return baseResponse(assistant, profile);
  }

  if (targetField && intent === "other") {
    const assistant = `Sure! Meanwhile — ${questionFor(profile, targetField)}`;
    await conversationsRepo.appendTurn(projectId, "assistant", assistant, { intent: `redirect_${targetField}` });
    computeCompleteness(profile);
    await profilesRepo.save(profile as profilesRepo.ProfileDoc);
    return baseResponse(assistant, profile);
  }

  let skippedNow = false;
  if (targetField && (intent === "skip" || (!route && SKIP_REQUEST_RE.test(message)))) {
    const skipped = [...((profile.skipped as string[] | undefined) ?? [])];
    if (!skipped.includes(targetField)) skipped.push(targetField);
    profile.skipped = skipped;
    skippedNow = true;
    targetField = null;
  }

  if (targetField) {
    const useCleaned =
      intent === "answer" && route?.value && !targetField.startsWith("location.");
    const source = useCleaned ? route!.value! : message;
    let [value, confidence] = extract(source, targetField, profile);
    if ((value == null || confidence === "low") && source !== message) {
      [value, confidence] = extract(message, targetField, profile);
    }
    const [, merged] = mergeField(profile, targetField, value, confidence);
    if (confidence === "low" && !merged) {
      const fallback = `I didn't catch that clearly yet. ${questionFor(profile, targetField)}`;
      const assistant = (await llmPhrase("clarify", fallback, message, profile)) ?? fallback;
      await conversationsRepo.appendTurn(projectId, "assistant", assistant, {
        intent: `clarify_${targetField}`,
        confidence,
      });
      computeCompleteness(profile);
      await profilesRepo.save(profile as profilesRepo.ProfileDoc);
      return baseResponse(assistant, profile);
    }
  }

  computeCompleteness(profile);
  await profilesRepo.save(profile as profilesRepo.ProfileDoc);
  const missing = (profile.completeness as Record<string, unknown>).missingFields as string[];
  const ready = !missing.length;

  let assistant: string;
  let outIntent: string;
  if (ready) {
    [assistant, outIntent] = await readyReply(message, profile);
  } else {
    const [question, nextField] = nextQuestion(profile);
    const percent = (profile.completeness as Record<string, unknown>).percent as number;
    const fallback = friendlyQuestion(question, percent);
    if (nextField === "business.description" || nextField === "location.country") {
      assistant = fallback;
    } else {
      assistant = (await llmPhrase("ask_next", fallback, message, profile)) ?? fallback;
    }
    outIntent = nextField ? `ask_${nextField}` : "ask_more";
  }
  if (skippedNow) assistant = `No problem — you can add it later from your profile. ${assistant}`;

  await conversationsRepo.appendTurn(projectId, "assistant", assistant, { intent: outIntent });
  return baseResponse(assistant, profile, ready, outIntent === "trigger_generate");
}

// Test seam: expose routing without DB for unit tests
export async function routeMessageForTests(
  message: string,
  targetField: string,
  profile: Record<string, unknown>,
): Promise<RouteResult | null> {
  return llmRoute(message, targetField, profile);
}

export function skipMessageForTests(message: string): boolean {
  return SKIP_REQUEST_RE.test(message);
}

export function clarifyMessageForTests(message: string): boolean {
  return CLARIFY_REQUEST_RE.test(message);
}
