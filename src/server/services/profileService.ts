import * as profilesRepo from "../repos/profilesRepo";
import * as projectsRepo from "../repos/projectsRepo";

const REQUIRED_FIELDS: Array<[string, string]> = [
  ["brand.brandName", "brand name"],
  ["business.type", "business type"],
  ["business.services", "at least one service"],
  ["business.description", "homepage intro line"],
  ["business.targetAudience", "target audience"],
  ["location.country", "country"],
  ["location.city", "city"],
];

const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/;
const MULTI_PLACE_RE = /,|\band\b/i;
const MERGE_KEYS = new Set(["brand", "business", "location", "contact", "design", "skipped"]);

export class ProfileValidationError extends Error {}
export class ProfileIncompleteError extends Error {
  constructor(readonly missingFields: string[]) {
    super("profile incomplete");
  }
}

export function isMultiPlaceValue(value: unknown): boolean {
  if (!value || typeof value !== "string") return false;
  const parts = value.split(MULTI_PLACE_RE).map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2;
}

export function splitMultiPlaceValue(value: unknown): string[] {
  if (!value || typeof value !== "string") return [];
  return value.split(MULTI_PLACE_RE).map((p) => p.trim()).filter(Boolean);
}

function getNested(profile: Record<string, unknown>, path: string): unknown {
  let cur: unknown = profile;
  for (const part of path.split(".")) {
    cur = typeof cur === "object" && cur !== null ? (cur as Record<string, unknown>)[part] : null;
    if (cur == null) return null;
  }
  return cur;
}

function missingFields(profile: Record<string, unknown>): string[] {
  const skipped = new Set((profile.skipped as string[] | undefined) ?? []);
  const missing: string[] = [];
  for (const [path, label] of REQUIRED_FIELDS) {
    if (skipped.has(path)) continue;
    const val = getNested(profile, path);
    if (path === "business.services") {
      if (!val || (Array.isArray(val) && val.length === 0)) missing.push(label);
    } else if (path === "location.city") {
      const country = getNested(profile, "location.country");
      if (isMultiPlaceValue(country)) continue;
      if (!val) missing.push(label);
    } else if (!val) {
      missing.push(label);
    }
  }
  return missing;
}

export function computeCompleteness(profile: Record<string, unknown>): Record<string, unknown> {
  const total = REQUIRED_FIELDS.length;
  const missing = missingFields(profile);
  const done = total - missing.length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  profile.completeness = { percent, missingFields: missing };
  return profile.completeness as Record<string, unknown>;
}

export function evaluateGenerationGate(profile: Record<string, unknown>): Record<string, unknown> {
  const completeness = computeCompleteness(profile);
  return {
    ready: !(completeness.missingFields as string[]).length,
    percent: completeness.percent,
    missingFields: completeness.missingFields,
  };
}

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  for (const [key, value] of Object.entries(patch)) {
    if (!MERGE_KEYS.has(key)) continue;
    if (typeof value === "object" && value !== null && typeof base[key] === "object" && base[key] !== null) {
      base[key] = { ...(base[key] as Record<string, unknown>), ...(value as Record<string, unknown>) };
    } else {
      base[key] = value;
    }
  }
  return base;
}

function validateProfile(profile: Record<string, unknown>): void {
  const email = getNested(profile, "contact.email");
  if (email && !EMAIL_RE.test(String(email))) throw new ProfileValidationError("invalid contact email");
  const phone = getNested(profile, "contact.phone");
  if (phone && !PHONE_RE.test(String(phone))) throw new ProfileValidationError("invalid contact phone");
  const services = getNested(profile, "business.services");
  if (services != null && !Array.isArray(services)) {
    throw new ProfileValidationError("business.services must be a list");
  }
}

export async function getProfile(projectId: string): Promise<Record<string, unknown>> {
  if (!(await projectsRepo.get(projectId))) throw new Error("project not found");
  const profile = await profilesRepo.get(projectId);
  profile.gate = evaluateGenerationGate(profile);
  return profile;
}

export async function updateProfile(
  projectId: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!(await projectsRepo.get(projectId))) throw new Error("project not found");
  const profile = await profilesRepo.get(projectId);
  deepMerge(profile, patch ?? {});
  validateProfile(profile);
  computeCompleteness(profile);
  await profilesRepo.save(profile);
  profile.gate = evaluateGenerationGate(profile);
  return profile;
}

export async function requireGenerationReady(projectId: string): Promise<Record<string, unknown>> {
  const profile = await profilesRepo.get(projectId);
  const gate = evaluateGenerationGate(profile);
  if (!gate.ready) throw new ProfileIncompleteError(gate.missingFields as string[]);
  return profile;
}
