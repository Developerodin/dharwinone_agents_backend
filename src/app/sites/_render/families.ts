import familiesCatalog from "@/server/data/familiesCatalog.json";

export type FamilyId =
  | "minimalist"
  | "sleek"
  | "professional"
  | "bold"
  | "editorial"
  | "premium"
  | "warm"
  | "playful"
  | "brutalist"
  | "glassmorphism"
  | "claymorphism"
  | "neomorphism"
  | "retro"
  | "corporate"
  | "organic"
  | "tech"
  | "industrial"
  | "gradient_modern";

export type SurfaceStyle = "flat" | "glass" | "clay" | "neo" | "brutal";
export type HeroStyle = "split" | "fullbleed_veil" | "photo_rounded" | "structured" | "centered";
export type ServicesStyle = "list" | "tiles" | "cards";
export type TestimonialsStyle = "cards" | "quotes";

export interface FamilyTokens {
  id: FamilyId;
  name: string;
  definition: string;
  surfaceStyle: SurfaceStyle;
  fonts: {
    heading: string;
    body: string;
    headingImport: string;
    bodyImport: string;
  };
  palette: { ink: string; bg: string; accent: string; soft: string; line: string };
  buttonRadius: string;
  heroStyle: HeroStyle;
  servicesStyle: ServicesStyle;
  testimonialsStyle: TestimonialsStyle;
  uppercaseDisplay: boolean;
  eyebrowTracking: string;
  fontPair: string;
  numberedSteps: boolean;
}

type FamilySeed = Omit<FamilyTokens, "name" | "definition">;

const CATALOG_BY_ID = Object.fromEntries(
  familiesCatalog.families.map((row) => [row.id, row]),
) as Record<FamilyId, { name: string; definition: string; surfaceStyle: SurfaceStyle }>;

function defineFamily(seed: FamilySeed): FamilyTokens {
  const meta = CATALOG_BY_ID[seed.id];
  return {
    ...seed,
    name: meta.name,
    definition: meta.definition,
    surfaceStyle: meta.surfaceStyle,
  };
}

export const FAMILIES: Record<FamilyId, FamilyTokens> = {
  minimalist: defineFamily({
    id: "minimalist",
    fonts: {
      heading: "Inter",
      body: "Inter",
      headingImport:
        "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      bodyImport:
        "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap",
    },
    palette: { ink: "#1a1a1a", bg: "#f8f8f6", accent: "#2563eb", soft: "#f0f0ed", line: "#e4e4e0" },
    buttonRadius: "0.25rem",
    heroStyle: "centered",
    servicesStyle: "list",
    testimonialsStyle: "quotes",
    uppercaseDisplay: false,
    eyebrowTracking: "0.1em",
    fontPair: "inter_inter",
    numberedSteps: false,
  }),
  sleek: defineFamily({
    id: "sleek",
    fonts: {
      heading: "Syne",
      body: "DM Sans",
      headingImport:
        "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Syne:wght@600;700&display=swap",
      bodyImport:
        "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap",
    },
    palette: { ink: "#0f172a", bg: "#f0f2f5", accent: "#0066cc", soft: "#e8ecf1", line: "#cbd5e1" },
    buttonRadius: "0.375rem",
    heroStyle: "structured",
    servicesStyle: "cards",
    testimonialsStyle: "cards",
    uppercaseDisplay: false,
    eyebrowTracking: "0.14em",
    fontPair: "syne_dm_sans",
    numberedSteps: false,
  }),
  professional: defineFamily({
    id: "professional",
    fonts: {
      heading: "Fraunces",
      body: "Inter",
      headingImport:
        "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Inter:wght@400;500;600&display=swap",
      bodyImport:
        "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Inter:wght@400;500;600&display=swap",
    },
    palette: { ink: "#232029", bg: "#edebe5", accent: "#7c2d3e", soft: "#f6f4ef", line: "#d8d4ca" },
    buttonRadius: "0.5rem",
    heroStyle: "centered",
    servicesStyle: "list",
    testimonialsStyle: "quotes",
    uppercaseDisplay: false,
    eyebrowTracking: "0.12em",
    fontPair: "fraunces_inter",
    numberedSteps: false,
  }),
  bold: defineFamily({
    id: "bold",
    fonts: {
      heading: "Oswald",
      body: "Inter",
      headingImport:
        "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Oswald:wght@500;600;700&display=swap",
      bodyImport:
        "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Oswald:wght@500;600;700&display=swap",
    },
    palette: { ink: "#eef3ec", bg: "#111814", accent: "#f4562a", soft: "#19221c", line: "#28342c" },
    buttonRadius: "0.5rem",
    heroStyle: "fullbleed_veil",
    servicesStyle: "tiles",
    testimonialsStyle: "quotes",
    uppercaseDisplay: true,
    eyebrowTracking: "0.18em",
    fontPair: "oswald_inter",
    numberedSteps: false,
  }),
  editorial: defineFamily({
    id: "editorial",
    fonts: {
      heading: "Playfair Display",
      body: "Source Serif 4",
      headingImport:
        "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap",
      bodyImport:
        "https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap",
    },
    palette: { ink: "#1c1917", bg: "#faf9f6", accent: "#8b2942", soft: "#f3f0ea", line: "#ddd6cb" },
    buttonRadius: "0",
    heroStyle: "split",
    servicesStyle: "list",
    testimonialsStyle: "quotes",
    uppercaseDisplay: false,
    eyebrowTracking: "0.16em",
    fontPair: "playfair_source_serif",
    numberedSteps: false,
  }),
  premium: defineFamily({
    id: "premium",
    fonts: {
      heading: "Bricolage Grotesque",
      body: "Instrument Sans",
      headingImport:
        "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&display=swap",
      bodyImport:
        "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&display=swap",
    },
    palette: { ink: "#14282e", bg: "#edf0e9", accent: "#c9631f", soft: "#e0e6dc", line: "#c9d2c5" },
    buttonRadius: "0.5rem",
    heroStyle: "fullbleed_veil",
    servicesStyle: "list",
    testimonialsStyle: "quotes",
    uppercaseDisplay: false,
    eyebrowTracking: "0.14em",
    fontPair: "bricolage_instrument",
    numberedSteps: false,
  }),
  warm: defineFamily({
    id: "warm",
    fonts: {
      heading: "Barlow Condensed",
      body: "Barlow",
      headingImport:
        "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;500;600&display=swap",
      bodyImport:
        "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;500;600&display=swap",
    },
    palette: { ink: "#26231c", bg: "#e9e5db", accent: "#38586e", soft: "#f3f0e8", line: "#d3ccbd" },
    buttonRadius: "0",
    heroStyle: "split",
    servicesStyle: "cards",
    testimonialsStyle: "cards",
    uppercaseDisplay: true,
    eyebrowTracking: "0.22em",
    fontPair: "barlow_condensed",
    numberedSteps: true,
  }),
  playful: defineFamily({
    id: "playful",
    fonts: {
      heading: "Bricolage Grotesque",
      body: "Inter",
      headingImport:
        "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Inter:wght@400;500;600&display=swap",
      bodyImport:
        "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Inter:wght@400;500;600&display=swap",
    },
    palette: { ink: "#182433", bg: "#f2f5f9", accent: "#0d6e60", soft: "#e7edf3", line: "#d3dce6" },
    buttonRadius: "0.5rem",
    heroStyle: "centered",
    servicesStyle: "cards",
    testimonialsStyle: "cards",
    uppercaseDisplay: false,
    eyebrowTracking: "0.12em",
    fontPair: "bricolage_inter",
    numberedSteps: false,
  }),
  brutalist: defineFamily({
    id: "brutalist",
    fonts: {
      heading: "Archivo Black",
      body: "Space Mono",
      headingImport:
        "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Space+Mono:wght@400;700&display=swap",
      bodyImport:
        "https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap",
    },
    palette: { ink: "#0a0a0a", bg: "#e8e4dc", accent: "#000000", soft: "#d9d4c8", line: "#0a0a0a" },
    buttonRadius: "0",
    heroStyle: "structured",
    servicesStyle: "list",
    testimonialsStyle: "quotes",
    uppercaseDisplay: true,
    eyebrowTracking: "0.08em",
    fontPair: "archivo_space_mono",
    numberedSteps: false,
  }),
  glassmorphism: defineFamily({
    id: "glassmorphism",
    fonts: {
      heading: "Outfit",
      body: "Outfit",
      headingImport: "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap",
      bodyImport: "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap",
    },
    palette: { ink: "#e2e8f0", bg: "#0f1419", accent: "#60a5fa", soft: "#1a2332", line: "#334155" },
    buttonRadius: "0.75rem",
    heroStyle: "fullbleed_veil",
    servicesStyle: "cards",
    testimonialsStyle: "cards",
    uppercaseDisplay: false,
    eyebrowTracking: "0.12em",
    fontPair: "outfit_outfit",
    numberedSteps: false,
  }),
  claymorphism: defineFamily({
    id: "claymorphism",
    fonts: {
      heading: "Nunito",
      body: "Nunito",
      headingImport: "https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800&display=swap",
      bodyImport: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600&display=swap",
    },
    palette: { ink: "#2d3748", bg: "#e8eef5", accent: "#f97316", soft: "#dce6f2", line: "#c5d4e8" },
    buttonRadius: "999px",
    heroStyle: "photo_rounded",
    servicesStyle: "tiles",
    testimonialsStyle: "cards",
    uppercaseDisplay: false,
    eyebrowTracking: "0.1em",
    fontPair: "nunito_nunito",
    numberedSteps: false,
  }),
  neomorphism: defineFamily({
    id: "neomorphism",
    fonts: {
      heading: "Manrope",
      body: "Manrope",
      headingImport: "https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap",
      bodyImport: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600&display=swap",
    },
    palette: { ink: "#4a5568", bg: "#e0e5ec", accent: "#6366f1", soft: "#d1d9e6", line: "#b8c4d4" },
    buttonRadius: "1rem",
    heroStyle: "centered",
    servicesStyle: "cards",
    testimonialsStyle: "cards",
    uppercaseDisplay: false,
    eyebrowTracking: "0.1em",
    fontPair: "manrope_manrope",
    numberedSteps: false,
  }),
  retro: defineFamily({
    id: "retro",
    fonts: {
      heading: "Libre Baskerville",
      body: "Libre Franklin",
      headingImport:
        "https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@700&family=Libre+Franklin:wght@400;500;600&display=swap",
      bodyImport:
        "https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;500;600&display=swap",
    },
    palette: { ink: "#3d2914", bg: "#f5e6d3", accent: "#c45c26", soft: "#edd9c0", line: "#d4b896" },
    buttonRadius: "0.25rem",
    heroStyle: "split",
    servicesStyle: "tiles",
    testimonialsStyle: "quotes",
    uppercaseDisplay: false,
    eyebrowTracking: "0.14em",
    fontPair: "libre_baskerville_franklin",
    numberedSteps: false,
  }),
  corporate: defineFamily({
    id: "corporate",
    fonts: {
      heading: "IBM Plex Sans",
      body: "IBM Plex Sans",
      headingImport:
        "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@500;600;700&display=swap",
      bodyImport:
        "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap",
    },
    palette: { ink: "#1e293b", bg: "#f4f6f8", accent: "#1e40af", soft: "#e8edf3", line: "#cbd5e1" },
    buttonRadius: "0.25rem",
    heroStyle: "structured",
    servicesStyle: "list",
    testimonialsStyle: "quotes",
    uppercaseDisplay: false,
    eyebrowTracking: "0.12em",
    fontPair: "ibm_plex_sans",
    numberedSteps: false,
  }),
  organic: defineFamily({
    id: "organic",
    fonts: {
      heading: "Lora",
      body: "Nunito Sans",
      headingImport:
        "https://fonts.googleapis.com/css2?family=Lora:wght@600;700&family=Nunito+Sans:wght@400;500;600&display=swap",
      bodyImport:
        "https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;500;600&display=swap",
    },
    palette: { ink: "#2f3e2e", bg: "#f2efe8", accent: "#4d7c0f", soft: "#e8e4d9", line: "#c9c2b0" },
    buttonRadius: "999px",
    heroStyle: "split",
    servicesStyle: "tiles",
    testimonialsStyle: "cards",
    uppercaseDisplay: false,
    eyebrowTracking: "0.1em",
    fontPair: "lora_nunito_sans",
    numberedSteps: false,
  }),
  tech: defineFamily({
    id: "tech",
    fonts: {
      heading: "JetBrains Mono",
      body: "Inter",
      headingImport:
        "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;700&display=swap",
      bodyImport:
        "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap",
    },
    palette: { ink: "#e6edf3", bg: "#0d1117", accent: "#22d3ee", soft: "#161b22", line: "#30363d" },
    buttonRadius: "0.375rem",
    heroStyle: "structured",
    servicesStyle: "cards",
    testimonialsStyle: "quotes",
    uppercaseDisplay: false,
    eyebrowTracking: "0.08em",
    fontPair: "jetbrains_inter",
    numberedSteps: false,
  }),
  industrial: defineFamily({
    id: "industrial",
    fonts: {
      heading: "Oswald",
      body: "Roboto",
      headingImport:
        "https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Roboto:wght@400;500;600&display=swap",
      bodyImport:
        "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600&display=swap",
    },
    palette: { ink: "#1c1917", bg: "#d4d4d4", accent: "#ea580c", soft: "#e5e5e5", line: "#a3a3a3" },
    buttonRadius: "0",
    heroStyle: "split",
    servicesStyle: "tiles",
    testimonialsStyle: "quotes",
    uppercaseDisplay: true,
    eyebrowTracking: "0.16em",
    fontPair: "oswald_roboto",
    numberedSteps: false,
  }),
  gradient_modern: defineFamily({
    id: "gradient_modern",
    fonts: {
      heading: "Plus Jakarta Sans",
      body: "Inter",
      headingImport:
        "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap",
      bodyImport:
        "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap",
    },
    palette: { ink: "#18181b", bg: "#fafafa", accent: "#7c3aed", soft: "#f4f4f5", line: "#e4e4e7" },
    buttonRadius: "0.75rem",
    heroStyle: "centered",
    servicesStyle: "cards",
    testimonialsStyle: "cards",
    uppercaseDisplay: false,
    eyebrowTracking: "0.12em",
    fontPair: "jakarta_inter",
    numberedSteps: false,
  }),
};

/** Legacy business-intent family ids mapped to the new UI axis. */
export const LEGACY_FAMILY_ALIASES: Record<string, FamilyId> = {
  trust_local: "warm",
  bold_convert: "bold",
  clean_pro: "professional",
  premium_dark: "premium",
  warm_craft: "warm",
  fresh_retail: "playful",
  generic: "minimalist",
  local_trustworthy: "warm",
};

export function resolveFamilyId(raw: string | null | undefined): FamilyId {
  if (!raw) return "warm";
  if (raw in FAMILIES) return raw as FamilyId;
  if (raw in LEGACY_FAMILY_ALIASES) return LEGACY_FAMILY_ALIASES[raw]!;
  return "warm";
}

export const FONT_PAIRS: Record<string, { heading: string; body: string }> = {
  inter_inter: { heading: "Inter", body: "Inter" },
  syne_dm_sans: { heading: "Syne", body: "DM Sans" },
  fraunces_inter: { heading: "Fraunces", body: "Inter" },
  oswald_inter: { heading: "Oswald", body: "Inter" },
  playfair_source_serif: { heading: "Playfair Display", body: "Source Serif 4" },
  bricolage_instrument: { heading: "Bricolage Grotesque", body: "Instrument Sans" },
  barlow_condensed: { heading: "Barlow Condensed", body: "Barlow" },
  bricolage_inter: { heading: "Bricolage Grotesque", body: "Inter" },
  archivo_space_mono: { heading: "Archivo Black", body: "Space Mono" },
  outfit_outfit: { heading: "Outfit", body: "Outfit" },
  nunito_nunito: { heading: "Nunito", body: "Nunito" },
  manrope_manrope: { heading: "Manrope", body: "Manrope" },
  libre_baskerville_franklin: { heading: "Libre Baskerville", body: "Libre Franklin" },
  ibm_plex_sans: { heading: "IBM Plex Sans", body: "IBM Plex Sans" },
  lora_nunito_sans: { heading: "Lora", body: "Nunito Sans" },
  jetbrains_inter: { heading: "JetBrains Mono", body: "Inter" },
  oswald_roboto: { heading: "Oswald", body: "Roboto" },
  jakarta_inter: { heading: "Plus Jakarta Sans", body: "Inter" },
};
