import { prisma } from "../db";
import { toDoc } from "./doc";

const ALLOWED_TYPES = new Set(["logo", "brand", "service", "team", "product"]);

function encodeAssetType(assetType: string, slotKey?: string | null): string {
  if (!slotKey) return assetType;
  return `${assetType}@${slotKey}`;
}

export function decodeSlotKey(asset: Record<string, unknown>): string | null {
  const raw = String(asset.assetType ?? "");
  const idx = raw.indexOf("@");
  return idx >= 0 ? raw.slice(idx + 1) : null;
}

export function allowedAssetTypes(): string[] {
  return [...ALLOWED_TYPES].sort();
}

export async function createPending(
  projectId: string,
  data: {
    assetId: string;
    assetType: string;
    s3Key: string;
    filename: string;
    contentType: string;
    slotKey?: string | null;
  },
): Promise<Record<string, unknown>> {
  if (!ALLOWED_TYPES.has(data.assetType)) throw new Error("invalid asset type");
  const now = Date.now() / 1000;
  const row = await prisma().projectAsset.create({
    data: {
      assetId: data.assetId,
      projectId,
      assetType: encodeAssetType(data.assetType, data.slotKey),
      filename: data.filename,
      contentType: data.contentType,
      s3Key: data.s3Key,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    },
  });
  return toDoc(row) as Record<string, unknown>;
}

export async function get(
  projectId: string,
  assetId: string,
): Promise<Record<string, unknown> | null> {
  const row = await prisma().projectAsset.findFirst({ where: { projectId, assetId } });
  return toDoc(row) as Record<string, unknown> | null;
}

export async function confirm(
  projectId: string,
  assetId: string,
  data: { sizeBytes: number; width?: number | null; height?: number | null },
): Promise<Record<string, unknown> | null> {
  const now = Date.now() / 1000;
  await prisma().projectAsset.updateMany({
    where: { projectId, assetId },
    data: {
      status: "ready",
      sizeBytes: data.sizeBytes,
      width: data.width ?? null,
      height: data.height ?? null,
      uploadedAt: now,
      updatedAt: now,
    },
  });
  return get(projectId, assetId);
}

export async function listForProject(projectId: string): Promise<Record<string, unknown>[]> {
  const rows = await prisma().projectAsset.findMany({
    where: { projectId, status: "ready" },
    orderBy: { uploadedAt: "desc" },
  });
  return rows.map((row) => toDoc(row) as Record<string, unknown>);
}
