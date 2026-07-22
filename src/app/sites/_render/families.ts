export type FamilyId =
  | "trust_local"
  | "bold_convert"
  | "clean_pro"
  | "premium_dark"
  | "warm_craft"
  | "fresh_retail";

export type HeroStyle = "split" | "fullbleed_veil" | "photo_rounded" | "structured" | "centered";
export type ServicesStyle = "list" | "tiles" | "cards";
export type TestimonialsStyle = "cards" | "quotes";

export interface FamilyTokens {
  id: FamilyId;
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
}

export const FAMILIES: Record<FamilyId, FamilyTokens> = {
  trust_local: {
    id: "trust_local",
    fonts: {
      heading: "Barlow Condensed",
      body: "Barlow",
      headingImport:
        "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;500;600&display=swap",
      bodyImport:
        "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;500;600&display=swap",
    },
    palette: {
      ink: "#26231c",
      bg: "#e9e5db",
      accent: "#38586e",
      soft: "#f3f0e8",
      line: "#d3ccbd",
    },
    buttonRadius: "0",
    heroStyle: "split",
    servicesStyle: "cards",
    testimonialsStyle: "cards",
    uppercaseDisplay: true,
    eyebrowTracking: "0.22em",
    fontPair: "barlow_condensed",
  },
  bold_convert: {
    id: "bold_convert",
    fonts: {
      heading: "Oswald",
      body: "Inter",
      headingImport:
        "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Oswald:wght@500;600;700&display=swap",
      bodyImport:
        "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Oswald:wght@500;600;700&display=swap",
    },
    palette: {
      ink: "#eef3ec",
      bg: "#111814",
      accent: "#f4562a",
      soft: "#19221c",
      line: "#28342c",
    },
    buttonRadius: "0.5rem",
    heroStyle: "fullbleed_veil",
    servicesStyle: "tiles",
    testimonialsStyle: "quotes",
    uppercaseDisplay: true,
    eyebrowTracking: "0.18em",
    fontPair: "oswald_inter",
  },
  clean_pro: {
    id: "clean_pro",
    fonts: {
      heading: "Fraunces",
      body: "Inter",
      headingImport:
        "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Inter:wght@400;500;600&display=swap",
      bodyImport:
        "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Inter:wght@400;500;600&display=swap",
    },
    palette: {
      ink: "#232029",
      bg: "#edebe5",
      accent: "#7c2d3e",
      soft: "#f6f4ef",
      line: "#d8d4ca",
    },
    buttonRadius: "0.5rem",
    heroStyle: "centered",
    servicesStyle: "list",
    testimonialsStyle: "quotes",
    uppercaseDisplay: false,
    eyebrowTracking: "0.12em",
    fontPair: "fraunces_inter",
  },
  premium_dark: {
    id: "premium_dark",
    fonts: {
      heading: "Bricolage Grotesque",
      body: "Instrument Sans",
      headingImport:
        "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&display=swap",
      bodyImport:
        "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&display=swap",
    },
    palette: {
      ink: "#14282e",
      bg: "#edf0e9",
      accent: "#c9631f",
      soft: "#e0e6dc",
      line: "#c9d2c5",
    },
    buttonRadius: "0.5rem",
    heroStyle: "fullbleed_veil",
    servicesStyle: "list",
    testimonialsStyle: "quotes",
    uppercaseDisplay: false,
    eyebrowTracking: "0.14em",
    fontPair: "bricolage_instrument",
  },
  warm_craft: {
    id: "warm_craft",
    fonts: {
      heading: "Fraunces",
      body: "Karla",
      headingImport:
        "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,900&family=Karla:wght@400;500;600&display=swap",
      bodyImport:
        "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,900&family=Karla:wght@400;500;600&display=swap",
    },
    palette: {
      ink: "#2e1f13",
      bg: "#f3ebdf",
      accent: "#a9631b",
      soft: "#eadfcd",
      line: "#d8c6ac",
    },
    buttonRadius: "999px",
    heroStyle: "split",
    servicesStyle: "tiles",
    testimonialsStyle: "cards",
    uppercaseDisplay: false,
    eyebrowTracking: "0.1em",
    fontPair: "fraunces_karla",
  },
  fresh_retail: {
    id: "fresh_retail",
    fonts: {
      heading: "Bricolage Grotesque",
      body: "Inter",
      headingImport:
        "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Inter:wght@400;500;600&display=swap",
      bodyImport:
        "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Inter:wght@400;500;600&display=swap",
    },
    palette: {
      ink: "#182433",
      bg: "#f2f5f9",
      accent: "#0d6e60",
      soft: "#e7edf3",
      line: "#d3dce6",
    },
    buttonRadius: "0.5rem",
    heroStyle: "centered",
    servicesStyle: "cards",
    testimonialsStyle: "cards",
    uppercaseDisplay: false,
    eyebrowTracking: "0.12em",
    fontPair: "bricolage_inter",
  },
};

export const FONT_PAIRS: Record<string, { heading: string; body: string }> = {
  barlow_condensed: { heading: "Barlow Condensed", body: "Barlow" },
  oswald_inter: { heading: "Oswald", body: "Inter" },
  fraunces_inter: { heading: "Fraunces", body: "Inter" },
  bricolage_instrument: { heading: "Bricolage Grotesque", body: "Instrument Sans" },
  fraunces_karla: { heading: "Fraunces", body: "Karla" },
  bricolage_inter: { heading: "Bricolage Grotesque", body: "Inter" },
};
