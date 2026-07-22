import { Prisma } from "@/generated/prisma/client";
import { sanitizeHtml } from "../draft";
import { prisma } from "../db";
import { toDoc } from "./doc";

function publicTemplate(row: {
  templateId: string;
  projectId: string | null;
  galleryIndex: number | null;
  generatedAt: number | null;
  doc: unknown;
}): Record<string, unknown> {
  const clean: Record<string, unknown> = {
    ...((row.doc as Record<string, unknown> | null) ?? {}),
    templateId: row.templateId,
    projectId: row.projectId,
    galleryIndex: row.galleryIndex,
    generatedAt: row.generatedAt,
  };
  if (typeof clean.htmlContent === "string") {
    clean.htmlContent = sanitizeHtml(clean.htmlContent);
  }
  return clean;
}

export async function replaceForProject(
  projectId: string,
  templates: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const now = Date.now() / 1000;
  await prisma().builderTemplate.deleteMany({ where: { projectId } });
  const saved: Record<string, unknown>[] = [];
  for (let idx = 0; idx < templates.length; idx++) {
    const item = { ...templates[idx]! };
    const templateId = (item.templateId as string | undefined) ?? randomId();
    const row = await prisma().builderTemplate.create({
      data: {
        templateId,
        projectId,
        galleryIndex: (item.galleryIndex as number | undefined) ?? idx,
        generatedAt: now,
        doc: item as Prisma.InputJsonValue,
      },
    });
    saved.push(publicTemplate(row));
  }
  saved.sort(
    (a, b) =>
      ((a.galleryIndex as number | undefined) ?? 999) -
        ((b.galleryIndex as number | undefined) ?? 999) ||
      String(a.templateId).localeCompare(String(b.templateId)),
  );
  return saved;
}

export async function listForProject(projectId: string): Promise<Record<string, unknown>[]> {
  const rows = await prisma().builderTemplate.findMany({
    where: { projectId },
    orderBy: [{ galleryIndex: "asc" }, { templateId: "asc" }],
  });
  return rows.map((row) => publicTemplate(row));
}

export async function get(
  projectId: string,
  templateId: string,
): Promise<Record<string, unknown> | null> {
  const row = await prisma().builderTemplate.findFirst({ where: { projectId, templateId } });
  return row ? publicTemplate(row) : null;
}

function randomId(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}
