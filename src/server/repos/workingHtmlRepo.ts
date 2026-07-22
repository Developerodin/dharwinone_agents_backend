import { sanitizeHtml } from "../draft";
import { prisma } from "../db";
import { toDoc } from "./doc";

const MAX_BYTES = 512 * 1024;

export class WorkingHtmlError extends Error {}

function validate(html: string): void {
  if (Buffer.byteLength(html, "utf8") > MAX_BYTES) {
    throw new WorkingHtmlError("working html exceeds 512KB");
  }
  const low = html.toLowerCase();
  if (!low.includes("<html") || !low.includes("</html>")) {
    throw new WorkingHtmlError("working html must be a full document");
  }
}

export async function get(projectId: string): Promise<Record<string, unknown> | null> {
  const row = await prisma().workingHtml.findUnique({ where: { projectId } });
  const doc = toDoc(row) as Record<string, unknown> | null;
  if (doc?.html && typeof doc.html === "string") {
    doc.html = sanitizeHtml(doc.html);
  }
  return doc;
}

export async function put(
  projectId: string,
  html: string,
  templateId: string | null = null,
): Promise<Record<string, unknown>> {
  validate(html);
  const clean = sanitizeHtml(html);
  const now = Date.now() / 1000;
  const row = await prisma().workingHtml.upsert({
    where: { projectId },
    create: { projectId, html: clean, selectedTemplateId: templateId, updatedAt: now },
    update: { html: clean, selectedTemplateId: templateId, updatedAt: now },
  });
  return toDoc(row) as Record<string, unknown>;
}

export async function requireHtml(projectId: string): Promise<string> {
  const doc = await get(projectId);
  if (!doc?.html || typeof doc.html !== "string") {
    throw new WorkingHtmlError("working html not found");
  }
  return doc.html;
}
