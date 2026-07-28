/** ISO 3166-1 alpha-2 resolver with common aliases and acronyms. */

type CountryEntry = {
  code: string;
  name: string;
  aliases: string[];
  dialCode?: string;
};

const COUNTRIES: CountryEntry[] = [
  { code: "US", name: "United States", aliases: ["usa", "u s a", "u s", "america", "united states of america"], dialCode: "1" },
  { code: "AE", name: "United Arab Emirates", aliases: ["uae", "u a e", "emirates"], dialCode: "971" },
  { code: "GB", name: "United Kingdom", aliases: ["uk", "u k", "great britain", "britain", "england"], dialCode: "44" },
  { code: "IN", name: "India", aliases: ["bharat"], dialCode: "91" },
  { code: "CA", name: "Canada", aliases: [], dialCode: "1" },
  { code: "AU", name: "Australia", aliases: [], dialCode: "61" },
  { code: "NZ", name: "New Zealand", aliases: [], dialCode: "64" },
  { code: "SG", name: "Singapore", aliases: [], dialCode: "65" },
  { code: "MY", name: "Malaysia", aliases: [], dialCode: "60" },
  { code: "PH", name: "Philippines", aliases: [], dialCode: "63" },
  { code: "ID", name: "Indonesia", aliases: [], dialCode: "62" },
  { code: "TH", name: "Thailand", aliases: [], dialCode: "66" },
  { code: "VN", name: "Vietnam", aliases: ["viet nam"], dialCode: "84" },
  { code: "JP", name: "Japan", aliases: [], dialCode: "81" },
  { code: "KR", name: "South Korea", aliases: ["korea", "republic of korea"], dialCode: "82" },
  { code: "CN", name: "China", aliases: ["prc", "peoples republic of china"], dialCode: "86" },
  { code: "HK", name: "Hong Kong", aliases: [], dialCode: "852" },
  { code: "TW", name: "Taiwan", aliases: [], dialCode: "886" },
  { code: "SA", name: "Saudi Arabia", aliases: ["ksa", "kingdom of saudi arabia"], dialCode: "966" },
  { code: "QA", name: "Qatar", aliases: [], dialCode: "974" },
  { code: "KW", name: "Kuwait", aliases: [], dialCode: "965" },
  { code: "BH", name: "Bahrain", aliases: [], dialCode: "973" },
  { code: "OM", name: "Oman", aliases: [], dialCode: "968" },
  { code: "PK", name: "Pakistan", aliases: [], dialCode: "92" },
  { code: "BD", name: "Bangladesh", aliases: [], dialCode: "880" },
  { code: "LK", name: "Sri Lanka", aliases: [], dialCode: "94" },
  { code: "NP", name: "Nepal", aliases: [], dialCode: "977" },
  { code: "DE", name: "Germany", aliases: ["deutschland"], dialCode: "49" },
  { code: "FR", name: "France", aliases: [], dialCode: "33" },
  { code: "IT", name: "Italy", aliases: [], dialCode: "39" },
  { code: "ES", name: "Spain", aliases: [], dialCode: "34" },
  { code: "NL", name: "Netherlands", aliases: ["holland"], dialCode: "31" },
  { code: "BE", name: "Belgium", aliases: [], dialCode: "32" },
  { code: "CH", name: "Switzerland", aliases: [], dialCode: "41" },
  { code: "SE", name: "Sweden", aliases: [], dialCode: "46" },
  { code: "NO", name: "Norway", aliases: [], dialCode: "47" },
  { code: "DK", name: "Denmark", aliases: [], dialCode: "45" },
  { code: "FI", name: "Finland", aliases: [], dialCode: "358" },
  { code: "IE", name: "Ireland", aliases: [], dialCode: "353" },
  { code: "PT", name: "Portugal", aliases: [], dialCode: "351" },
  { code: "PL", name: "Poland", aliases: [], dialCode: "48" },
  { code: "AT", name: "Austria", aliases: [], dialCode: "43" },
  { code: "GR", name: "Greece", aliases: [], dialCode: "30" },
  { code: "TR", name: "Turkey", aliases: ["turkiye"], dialCode: "90" },
  { code: "RU", name: "Russia", aliases: ["russian federation"], dialCode: "7" },
  { code: "UA", name: "Ukraine", aliases: [], dialCode: "380" },
  { code: "ZA", name: "South Africa", aliases: [], dialCode: "27" },
  { code: "NG", name: "Nigeria", aliases: [], dialCode: "234" },
  { code: "KE", name: "Kenya", aliases: [], dialCode: "254" },
  { code: "EG", name: "Egypt", aliases: [], dialCode: "20" },
  { code: "MX", name: "Mexico", aliases: [], dialCode: "52" },
  { code: "BR", name: "Brazil", aliases: [], dialCode: "55" },
  { code: "AR", name: "Argentina", aliases: [], dialCode: "54" },
  { code: "CL", name: "Chile", aliases: [], dialCode: "56" },
  { code: "CO", name: "Colombia", aliases: [], dialCode: "57" },
  { code: "IL", name: "Israel", aliases: [], dialCode: "972" },
];

function normalizeKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[.'']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactKey(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function keysMatch(a: string, b: string): boolean {
  const normA = normalizeKey(a);
  const normB = normalizeKey(b);
  if (normA && normA === normB) return true;
  const compactA = compactKey(a);
  const compactB = compactKey(b);
  return compactA.length > 0 && compactA === compactB;
}

/** Resolve free-text country input to canonical name + ISO alpha-2 code. */
export function resolveCountry(input: string): { country: string; country_code: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  for (const entry of COUNTRIES) {
    if (keysMatch(trimmed, entry.code) || keysMatch(trimmed, entry.name)) {
      return { country: entry.name, country_code: entry.code };
    }
    for (const alias of entry.aliases) {
      if (keysMatch(trimmed, alias)) {
        return { country: entry.name, country_code: entry.code };
      }
    }
  }

  return null;
}

/** Default international dial prefix for a resolved ISO country code. */
export function dialCodeForCountry(countryCode: string): string | undefined {
  const code = countryCode.trim().toUpperCase();
  return COUNTRIES.find((entry) => entry.code === code)?.dialCode;
}

/** Apply country normalization to a business profile record. */
export function normalizeCountryInProfile(
  profile: Record<string, unknown>,
): Record<string, unknown> {
  const raw = profile.country;
  if (typeof raw !== "string" || !raw.trim()) {
    return profile;
  }

  const resolved = resolveCountry(raw);
  if (resolved) {
    return {
      ...profile,
      country: resolved.country,
      country_code: resolved.country_code,
    };
  }

  const out = { ...profile, country: raw.trim() };
  delete out.country_code;
  return out;
}

export function isUnrecognizedCountry(profile: Record<string, unknown>): boolean {
  const country = profile.country;
  if (country == null || (typeof country === "string" && country.trim().length === 0)) {
    return false;
  }
  const code = profile.country_code;
  return typeof code !== "string" || code.trim().length !== 2;
}
