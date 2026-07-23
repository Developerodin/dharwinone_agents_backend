import { Prisma } from "@/generated/prisma/client";
import { prisma } from "../db";
import { toDoc } from "./doc";

export type CategoryDoc = Record<string, unknown> & {
  categoryId: string;
  name: string;
};

export type CategoryUpdate = Partial<{
  name: string;
  subcategoriesJson: unknown;
  questionnaireConfigJson: unknown;
  imagePackRefs: unknown;
}>;

/**
 * Categories are DB-authoritative: reads come straight from the `categories`
 * table and whatever is stored there wins (admin edits stick). Populate or
 * refresh the table with the explicit seed — `npm run seed:categories` — whose
 * only source is the file catalog under assets/categories. Files are never
 * consulted at read time.
 */
export async function listAll(): Promise<CategoryDoc[]> {
  const rows = await prisma().category.findMany({ orderBy: { name: "asc" } });
  return rows.map((row) => toDoc(row) as CategoryDoc);
}

export async function get(categoryId: string): Promise<CategoryDoc | null> {
  const row = await prisma().category.findFirst({ where: { categoryId } });
  return row ? (toDoc(row) as CategoryDoc) : null;
}

/** Partial edit of a category. Returns the updated row, or null if unknown. */
export async function update(categoryId: string, fields: CategoryUpdate): Promise<CategoryDoc | null> {
  const data: Prisma.CategoryUpdateInput = {};
  if (fields.name !== undefined) data.name = fields.name;
  if (fields.subcategoriesJson !== undefined) {
    data.subcategoriesJson = fields.subcategoriesJson as Prisma.InputJsonValue;
  }
  if (fields.questionnaireConfigJson !== undefined) {
    data.questionnaireConfigJson = fields.questionnaireConfigJson as Prisma.InputJsonValue;
  }
  if (fields.imagePackRefs !== undefined) {
    data.imagePackRefs = fields.imagePackRefs as Prisma.InputJsonValue;
  }
  try {
    const row = await prisma().category.update({ where: { categoryId }, data });
    return toDoc(row) as CategoryDoc;
  } catch (exc) {
    if (exc instanceof Prisma.PrismaClientKnownRequestError && exc.code === "P2025") return null;
    throw exc;
  }
}
