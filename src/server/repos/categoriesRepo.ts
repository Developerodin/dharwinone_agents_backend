import { Prisma } from "@/generated/prisma/client";
import { listSegmentSummaries } from "../data/categoryCatalog";
import { prisma } from "../db";
import { toDoc } from "./doc";

export type CategoryDoc = Record<string, unknown> & {
  categoryId: string;
  name: string;
};

const SHARED_QUESTIONNAIRE = {
  required: ["business_name", "city", "services", "cta_preference"],
  recommended: ["service_area", "tone_preference", "phone", "whatsapp_number"],
  fields: {
    business_name: {
      label: "Business name",
      tier: "required",
      followUp: "What's the name of your business? This appears on your site header and contact sections.",
    },
    city: { label: "Primary city", tier: "required" },
    services: { label: "Main services", tier: "required", type: "tags" },
    cta_preference: {
      label: "Preferred CTA",
      tier: "required",
      type: "enum",
      options: ["whatsapp", "phone", "form"],
      followUp:
        "How should customers reach you on your site? Reply with WhatsApp, phone call, or contact form.",
    },
    service_area: { label: "Service areas", tier: "recommended", type: "tags" },
    tone_preference: { label: "Brand tone", tier: "recommended" },
    phone: {
      label: "Phone number",
      tier: "recommended",
      followUp: "What phone number should customers call? Include country code if helpful.",
    },
    whatsapp_number: { label: "WhatsApp number", tier: "recommended" },
  },
};

function buildSeed(): CategoryDoc[] {
  return listSegmentSummaries().map((segment) => ({
    categoryId: segment.categoryId,
    name: segment.name,
    subcategoriesJson: segment.subcategories,
    keywordsJson: segment.keywords,
    questionnaireConfigJson: SHARED_QUESTIONNAIRE,
    imagePackRefs: segment.imagePackRefs,
  }));
}

function subcategoryIds(doc: CategoryDoc): string[] {
  const rows = doc.subcategoriesJson as Array<{ id: string }> | undefined;
  return (rows ?? []).map((row) => row.id).sort();
}

export async function ensureSeeded(): Promise<void> {
  const seed = buildSeed();

  for (const item of seed) {
    const existing = await prisma().category.findFirst({
      where: { categoryId: item.categoryId },
      select: { id: true, subcategoriesJson: true },
    });

    if (!existing) {
      await prisma().category.create({
        data: {
          categoryId: item.categoryId,
          name: item.name,
          subcategoriesJson: item.subcategoriesJson as Prisma.InputJsonValue,
          questionnaireConfigJson: item.questionnaireConfigJson as Prisma.InputJsonValue,
          imagePackRefs: (item.imagePackRefs ?? []) as Prisma.InputJsonValue,
        },
      });
      continue;
    }

    const existingIds = subcategoryIds({ subcategoriesJson: existing.subcategoriesJson } as CategoryDoc);
    const seedIds = subcategoryIds(item);
    const needsUpdate =
      existingIds.length !== seedIds.length || existingIds.some((id, index) => id !== seedIds[index]);

    if (needsUpdate) {
      await prisma().category.update({
        where: { id: existing.id },
        data: {
          name: item.name,
          subcategoriesJson: item.subcategoriesJson as Prisma.InputJsonValue,
          questionnaireConfigJson: item.questionnaireConfigJson as Prisma.InputJsonValue,
          imagePackRefs: (item.imagePackRefs ?? []) as Prisma.InputJsonValue,
        },
      });
    }
  }
}

export async function listAll(): Promise<CategoryDoc[]> {
  await ensureSeeded();
  const rows = await prisma().category.findMany({ orderBy: { name: "asc" } });
  return rows.map((row) => {
    const doc = toDoc(row) as CategoryDoc;
    const segment = listSegmentSummaries().find((item) => item.categoryId === doc.categoryId);
    if (segment) {
      doc.subcategoriesJson = segment.subcategories;
      doc.keywordsJson = segment.keywords;
    }
    return doc;
  });
}

export async function get(categoryId: string): Promise<CategoryDoc | null> {
  await ensureSeeded();
  const row = await prisma().category.findFirst({ where: { categoryId } });
  if (!row) return null;
  const doc = toDoc(row) as CategoryDoc;
  const segment = listSegmentSummaries().find((item) => item.categoryId === categoryId);
  if (segment) {
    doc.subcategoriesJson = segment.subcategories;
    doc.keywordsJson = segment.keywords;
  }
  return doc;
}
