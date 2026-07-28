import { FAMILIES, resolveFamilyId, type FamilyId } from "./families";
import { getTemplate, DEFAULT_SECTION_ORDER } from "@/server/data/templateRegistry";

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is Record<string, unknown> =>
      Boolean(v) && typeof v === "object" && !Array.isArray(v),
  );
}

export function buildCtaHref(businessProfile: Record<string, unknown>): string {
  const cta = asString(businessProfile.cta_preference) || "whatsapp";
  const whatsapp = asString(businessProfile.whatsapp_number).replace(/\D/g, "");
  const phone = asString(businessProfile.phone) || asString(businessProfile.phone_number);
  if (cta === "phone" && phone) return `tel:${phone}`;
  if (whatsapp) return `https://wa.me/${whatsapp}`;
  if (phone) return `tel:${phone}`;
  return "#";
}


export function familyFromTemplateId(templateId: string | null | undefined): FamilyId {
  if (!templateId) return "warm";
  const template = getTemplate(templateId);
  const tag = template?.style_tags?.[0];
  return resolveFamilyId(tag);
}

export function sectionSchemaSections(templateId: string | null | undefined): string[] {
  const template = templateId ? getTemplate(templateId) : undefined;
  const schema = template?.section_schema as { sections?: string[] } | undefined;
  if (Array.isArray(schema?.sections) && schema.sections.length) return schema.sections;
  return DEFAULT_SECTION_ORDER;
}
