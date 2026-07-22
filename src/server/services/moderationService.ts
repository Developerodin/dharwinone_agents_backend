/** Moderation gate on business_profile before generation (Phase 1 M1). */

const BLOCKED_CATEGORIES = new Set([
  "adult",
  "gambling",
  "weapons",
  "illegal_drugs",
  "counterfeit",
]);

const BLOCKED_KEYWORDS = [
  /\b(?:child\s+porn|csam)\b/i,
  /\b(?:hire\s+a\s+hitman|assassination\s+service)\b/i,
  /\b(?:fake\s+passport|counterfeit\s+money)\b/i,
];

export type ModerationResult = {
  allowed: boolean;
  flagged: boolean;
  source: "stub" | "openai" | "rules";
  categories?: string[];
  message?: string;
};

function profileText(profile: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const value of Object.values(profile)) {
    if (typeof value === "string") parts.push(value);
    else if (Array.isArray(value)) parts.push(value.map(String).join(" "));
  }
  return parts.join("\n");
}

function ruleCheck(profile: Record<string, unknown>): ModerationResult | null {
  const category = String(profile.category ?? profile.subcategory ?? "").toLowerCase();
  if (BLOCKED_CATEGORIES.has(category)) {
    return {
      allowed: false,
      flagged: true,
      source: "rules",
      message: "This business category is not supported.",
    };
  }
  const text = profileText(profile);
  for (const re of BLOCKED_KEYWORDS) {
    if (re.test(text)) {
      return {
        allowed: false,
        flagged: true,
        source: "rules",
        message: "Business description violates content policy.",
      };
    }
  }
  return null;
}

async function openAiModeration(text: string): Promise<ModerationResult | null> {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: text.slice(0, 8000) }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{ flagged?: boolean; categories?: Record<string, boolean> }>;
    };
    const result = data.results?.[0];
    if (!result) return null;
    const flaggedCats = Object.entries(result.categories ?? {})
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (result.flagged) {
      return {
        allowed: false,
        flagged: true,
        source: "openai",
        categories: flaggedCats,
        message: "Business profile flagged by moderation.",
      };
    }
    return { allowed: true, flagged: false, source: "openai", categories: flaggedCats };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function moderateBusinessProfile(
  profile: Record<string, unknown>,
): Promise<ModerationResult> {
  const rules = ruleCheck(profile);
  if (rules) return rules;

  const text = profileText(profile);
  if (text.trim()) {
    const openAi = await openAiModeration(text);
    if (openAi) return openAi;
  }

  return { allowed: true, flagged: false, source: "stub" };
}

export class ModerationBlockedError extends Error {
  constructor(public readonly result: ModerationResult) {
    super(result.message ?? "business profile blocked by moderation");
    this.name = "ModerationBlockedError";
  }
}

export async function assertModerationAllowed(profile: Record<string, unknown>): Promise<ModerationResult> {
  const result = await moderateBusinessProfile(profile);
  if (!result.allowed) throw new ModerationBlockedError(result);
  return result;
}
