import { createHash } from "node:crypto";
import { prisma } from "../db";
import { toDoc } from "./doc";

function profileHash(profile: Record<string, unknown> | null | undefined): string {
  const raw = JSON.stringify(Object.entries(profile ?? {}).sort());
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

export async function create(
  projectId: string,
  data: {
    label: string;
    trigger: string;
    html: string;
    profile?: Record<string, unknown> | null;
  },
): Promise<Record<string, unknown>> {
  const versionId = randomId();
  const now = Date.now() / 1000;
  const row = await prisma().builderVersion.create({
    data: {
      versionId,
      projectId,
      label: data.label,
      trigger: data.trigger,
      createdAt: now,
      snapshotHtml: data.html,
      snapshotProfileHash: profileHash(data.profile),
      s3HtmlKey: `projects/${projectId}/versions/${versionId}.html`,
    },
  });
  return toDoc(row) as Record<string, unknown>;
}

export async function listForProject(projectId: string): Promise<Record<string, unknown>[]> {
  const rows = await prisma().builderVersion.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => toDoc(row) as Record<string, unknown>);
}

export async function get(
  projectId: string,
  versionId: string,
): Promise<Record<string, unknown> | null> {
  const row = await prisma().builderVersion.findFirst({ where: { projectId, versionId } });
  return toDoc(row) as Record<string, unknown> | null;
}

export async function head(projectId: string): Promise<Record<string, unknown> | null> {
  const versions = await listForProject(projectId);
  return versions[0] ?? null;
}

function randomId(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}
