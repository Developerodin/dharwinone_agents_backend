/** Chat intake helpers — parse user replies for gap-check follow-ups. */
import { resolveCountry } from "../data/countryCodes";

const YES_PATTERN =
  /^(yes|y|yeah|yep|sure|ok|okay|looks good|looks right|correct|fine|perfect|that'?s right|confirm(ed)?)[!.?]*$/i;

/** Parse a services follow-up reply (yes / add extras / custom comma list). */
export function parseServicesAnswer(answer: string, suggestedServices: string[]): string[] {
  const trimmed = answer.trim();
  if (!trimmed) return [];

  if (YES_PATTERN.test(trimmed)) {
    return [...suggestedServices];
  }

  const addMatch = trimmed.match(/^add\s+(.+)$/is);
  if (addMatch) {
    const extras = splitServiceList(addMatch[1]!);
    return dedupe([...suggestedServices, ...extras]);
  }

  if (trimmed.includes(",") || trimmed.includes(";")) {
    return dedupe(splitServiceList(trimmed));
  }

  return dedupe([trimmed]);
}

/** Normalize a free-text enum answer to a canonical option value when possible. */
export function parseEnumAnswer(
  answer: string,
  options: string[],
  optionLabels?: Record<string, string>,
): string | undefined {
  const trimmed = answer.trim();
  if (!trimmed) return undefined;

  const lower = trimmed.toLowerCase();
  for (const option of options) {
    if (option.toLowerCase() === lower) return option;
    const label = optionLabels?.[option];
    if (label && label.toLowerCase() === lower) return option;
  }

  for (const option of options) {
    const label = optionLabels?.[option] ?? option.replace(/_/g, " ");
    if (label.toLowerCase().includes(lower) || lower.includes(label.toLowerCase())) {
      return option;
    }
  }

  return trimmed;
}

/** Normalize a country free-text answer to canonical name + ISO code when possible. */
export function parseCountryAnswer(
  answer: string,
): { country: string; country_code: string } | { country: string } {
  const trimmed = answer.trim();
  const resolved = resolveCountry(trimmed);
  if (resolved) return resolved;
  return { country: trimmed };
}

function splitServiceList(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
