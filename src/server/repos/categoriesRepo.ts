import { prisma } from "../db";
import { toDoc } from "./doc";

export type CategoryDoc = Record<string, unknown> & {
  categoryId: string;
  name: string;
};

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
