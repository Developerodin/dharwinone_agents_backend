import { NextResponse } from "next/server";
import { listSegmentSummaries } from "@/server/data/categoryCatalog";
import * as categoriesRepo from "@/server/repos/categoriesRepo";

/**
 * Live categories for web-agent / sites intake.
 * Source of truth for M1 eligibility is disk `status: "active"` configs
 * (via listSegmentSummaries). DB rows supply questionnaire when present.
 */
export async function GET() {
  const live = listSegmentSummaries();
  const dbRows = await categoriesRepo.listAll().catch(() => []);
  const byId = new Map(dbRows.map((row) => [String(row.categoryId), row]));

  return NextResponse.json(
    live.map((segment) => {
      const db = byId.get(segment.categoryId);
      return {
        categoryId: segment.categoryId,
        name: segment.name,
        subcategoriesJson: segment.subcategories,
        imagePackRefs: segment.imagePackRefs,
        ...(db?.questionnaireConfigJson != null
          ? { questionnaireConfigJson: db.questionnaireConfigJson }
          : {}),
      };
    }),
  );
}
