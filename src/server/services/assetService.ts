import * as assetsRepo from "../repos/assetsRepo";
import * as projectsRepo from "../repos/projectsRepo";
import * as s3 from "../storage/s3";

const FILENAME_RE = /^[\w.\- ]{1,120}$/i;

export class AssetValidationError extends Error {}

async function requireProject(projectId: string): Promise<void> {
  if (!(await projectsRepo.get(projectId))) throw new Error("project not found");
}

export async function createPresign(
  projectId: string,
  data: { filename: string; contentType: string; assetType: string; slotKey?: string | null },
): Promise<Record<string, unknown>> {
  await requireProject(projectId);
  const allowed = new Set(assetsRepo.allowedAssetTypes());
  if (!allowed.has(data.assetType)) throw new AssetValidationError("invalid asset type");
  if (!data.filename || !FILENAME_RE.test(data.filename)) {
    throw new AssetValidationError("invalid filename");
  }
  if (!data.contentType || !data.contentType.includes("/")) {
    throw new AssetValidationError("invalid content type");
  }
  const assetId = randomId();
  const s3Key = s3.buildAssetKey(projectId, assetId, data.filename);
  const signed = await s3.createPresignedPut(s3Key, data.contentType);
  await assetsRepo.createPending(projectId, {
    assetId,
    assetType: data.assetType,
    slotKey: data.slotKey,
    s3Key,
    filename: data.filename,
    contentType: data.contentType,
  });
  return {
    assetId,
    slotKey: data.slotKey ?? null,
    s3Key,
    uploadUrl: signed.url,
    method: signed.method,
    headers: signed.headers,
    expiresAt: signed.expiresAt,
  };
}

function withPublicUrl(asset: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!asset) return asset;
  const out = { ...asset };
  const pub = s3.publicAssetUrl(String(asset.s3Key ?? ""));
  if (pub) out.publicUrl = pub;
  return out;
}

export async function confirmUpload(
  projectId: string,
  data: {
    assetId: string;
    s3Key: string;
    contentType: string;
    sizeBytes: number;
    width?: number | null;
    height?: number | null;
    slotKey?: string;
    assetType?: string;
  },
): Promise<Record<string, unknown>> {
  await requireProject(projectId);
  const pending = await assetsRepo.get(projectId, data.assetId);
  if (!pending) throw new AssetValidationError("asset not found");
  if (pending.s3Key !== data.s3Key) throw new AssetValidationError("s3 key mismatch");
  if (pending.contentType !== data.contentType) throw new AssetValidationError("content type mismatch");
  if (data.sizeBytes <= 0) throw new AssetValidationError("invalid file size");
  const asset = await assetsRepo.confirm(projectId, data.assetId, {
    sizeBytes: data.sizeBytes,
    width: data.width,
    height: data.height,
  });
  return withPublicUrl(asset)!;
}

export async function listAssets(projectId: string): Promise<Record<string, unknown>[]> {
  await requireProject(projectId);
  const assets = await assetsRepo.listForProject(projectId);
  return assets.map((a) => withPublicUrl(a)!);
}

function randomId(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}
