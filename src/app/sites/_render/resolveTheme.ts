import type { CSSProperties } from "react";
import type { FamilyId } from "./families";

const PADDING: Record<string, string> = {
  compact: "2rem",
  normal: "4rem",
  spacious: "6rem",
};

const RADIUS: Record<string, string> = {
  none: "0",
  sm: "0.25rem",
  md: "0.5rem",
  lg: "1rem",
  full: "9999px",
};

export interface RenderContext {
  family: FamilyId;
  sectionOrder: string[];
  getSectionStyle: (sectionKey: string) => CSSProperties;
  getElementStyle: (elementKey: string) => CSSProperties;
  scrimFor: (slotKey: string) => number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

export function resolveTheme(args: {
  family: FamilyId;
  themeJson: Record<string, unknown>;
  sectionSchemaSections: string[];
}): RenderContext {
  const themeJson = args.themeJson ?? {};
  const hidden = new Set(
    Array.isArray(themeJson.hiddenSections)
      ? themeJson.hiddenSections.filter((s): s is string => typeof s === "string")
      : [],
  );
  const orderSource = Array.isArray(themeJson.sectionOrder)
    ? themeJson.sectionOrder.filter((s): s is string => typeof s === "string")
    : args.sectionSchemaSections;
  const sectionOrder = orderSource.filter((key) => !hidden.has(key));

  const sectionOverrides = asRecord(themeJson.sectionOverrides);
  const elementOverrides = asRecord(themeJson.elementOverrides);
  const imageOverrides = asRecord(themeJson.imageOverrides);

  return {
    family: args.family,
    sectionOrder,
    getSectionStyle(sectionKey: string) {
      const override = asRecord(sectionOverrides[sectionKey]);
      const paddingKey = asString(override.padding) ?? "normal";
      const style: CSSProperties = {};
      const bg = asString(override.bgColor);
      const color = asString(override.textColor);
      const align = asString(override.align);
      if (bg) style.backgroundColor = bg;
      if (color) style.color = color;
      if (align) style.textAlign = align as CSSProperties["textAlign"];
      style.paddingTop = PADDING[paddingKey] ?? PADDING.normal;
      style.paddingBottom = PADDING[paddingKey] ?? PADDING.normal;
      return style;
    },
    getElementStyle(elementKey: string) {
      const override = asRecord(elementOverrides[elementKey]);
      const style: CSSProperties = {};
      const bg = asString(override.bg);
      const color = asString(override.textColor) ?? asString(override.color);
      const radius = asString(override.radius);
      if (bg) style.backgroundColor = bg;
      if (color) style.color = color;
      if (radius) style.borderRadius = RADIUS[radius] ?? radius;
      return style;
    },
    scrimFor(slotKey: string) {
      const override = asRecord(imageOverrides[slotKey]);
      return asNumber(override.scrimOpacity) ?? 0.35;
    },
  };
}
