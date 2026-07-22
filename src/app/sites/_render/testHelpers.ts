import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FAMILIES } from "./families";
import { resolveTheme } from "./resolveTheme";
import type { SectionProps } from "./types";

export function baseSectionProps(
  overrides: Partial<SectionProps> & { content?: Record<string, unknown> } = {},
): SectionProps {
  const ctx = resolveTheme({
    family: "trust_local",
    themeJson: {},
    sectionSchemaSections: ["hero", "services", "cta_footer"],
  });
  return {
    content: {},
    family: FAMILIES.trust_local,
    ctx,
    businessProfile: { whatsapp_number: "+919876543210", cta_preference: "whatsapp" },
    resolveImage: () => null,
    ...overrides,
  };
}

export function renderSection(
  Component: React.ComponentType<SectionProps>,
  props: SectionProps,
): string {
  return renderToStaticMarkup(React.createElement(Component, props));
}
