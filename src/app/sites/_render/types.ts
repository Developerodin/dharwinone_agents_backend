import type { FamilyTokens } from "./families";
import type { RenderContext } from "./resolveTheme";

export interface SectionProps {
  content: Record<string, unknown>;
  family: FamilyTokens;
  ctx: RenderContext;
  businessProfile: Record<string, unknown>;
  resolveImage: (
    slotKey: string,
    index?: number,
  ) => { url: string; alt: string; focalPoint?: { x: number; y: number } } | null;
}
