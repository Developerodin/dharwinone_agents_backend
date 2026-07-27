/** Site-scoped asset uploads — stores in project_assets keyed by siteId. */
import * as assetsRepo from "../repos/assetsRepo";
import * as sitesRepo from "../repos/sitesRepo";
import * as s3 from "../storage/s3";
import { randomId } from "../ids";

const FILENAME_RE = /^[\p{L}\p{N}_.\- ]{1,120}$/u;

function sanitizeFilename(name: string): string {
  const raw = (name || "").trim() || "upload.bin";
  const lastDot = raw.lastIndexOf(".");
  const hasExt = lastDot > 0 && lastDot < raw.length - 1;
  const baseRaw = hasExt ? raw.slice(0, lastDot) : raw;
  const extRaw = hasExt ? raw.slice(lastDot + 1) : "bin";
  const base =
    baseRaw
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}_.\- ]+/gu, "-")
      .replace(/[-_\s.]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "upload";
  const ext =
    extRaw
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "")
      .slice(0, 8) || "bin";
  return `${base}.${ext}`.slice(0, 120);
}
const LOGO_MIN_PX = 512;

export class SiteAssetValidationError extends Error {}

async function requireOwnedSite(siteId: string, userId: string): Promise<Record<string, unknown>> {
  const site = await sitesRepo.get(siteId);
  if (!site) throw new SiteAssetValidationError("site not found");
  if (site.userId !== userId) throw new SiteAssetValidationError("forbidden");
  return site;
}

function logoWarnings(width?: number | null, height?: number | null): string[] {
  const w = width ?? 0;
  const h = height ?? 0;
  if (!w || !h) return [];
  if (Math.min(w, h) < LOGO_MIN_PX) {
    return [`Logo below recommended ${LOGO_MIN_PX}px minimum (${w}×${h})`];
  }
  return [];
}

function withPublicUrl(asset: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!asset) return asset;
  const out = { ...asset };
  const pub = s3.publicAssetUrl(String(asset.s3Key ?? ""));
  if (pub) out.publicUrl = pub;
  return out;
}

export async function createPresign(
  siteId: string,
  userId: string,
  data: {
    filename: string;
    contentType: string;
    assetType: string;
    slotKey?: string;
  },
): Promise<Record<string, unknown>> {
  await requireOwnedSite(siteId, userId);
  const allowed = new Set(assetsRepo.allowedAssetTypes());
  if (!allowed.has(data.assetType)) throw new SiteAssetValidationError("invalid asset type");
  if (!data.filename || !FILENAME_RE.test(data.filename)) {
    data = { ...data, filename: sanitizeFilename(data.filename || "upload.bin") };
  }
  if (!FILENAME_RE.test(data.filename)) {
    throw new SiteAssetValidationError("invalid filename");
  }
  if (!data.contentType || !data.contentType.includes("/")) {
    throw new SiteAssetValidationError("invalid content type");
  }

  const assetId = randomId();
  const s3Key = s3.buildAssetKey(siteId, assetId, data.filename);
  const signed = await s3.createPresignedPut(s3Key, data.contentType);
  await assetsRepo.createPending(siteId, {
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

export async function confirmUpload(
  siteId: string,
  userId: string,
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
  await requireOwnedSite(siteId, userId);
  const pending = await assetsRepo.get(siteId, data.assetId);
  if (!pending) throw new SiteAssetValidationError("asset not found");
  if (pending.s3Key !== data.s3Key) throw new SiteAssetValidationError("s3 key mismatch");
  if (pending.contentType !== data.contentType) throw new SiteAssetValidationError("content type mismatch");
  if (data.sizeBytes <= 0) throw new SiteAssetValidationError("invalid file size");

  const asset = await assetsRepo.confirm(siteId, data.assetId, {
    sizeBytes: data.sizeBytes,
    width: data.width,
    height: data.height,
  });
  const slotKey = data.slotKey ?? assetsRepo.decodeSlotKey(asset ?? {});
  const baseType = String(pending.assetType ?? "").split("@")[0];
  const warnings = baseType === "logo" || slotKey === "logo" ? logoWarnings(data.width, data.height) : [];
  return { ...withPublicUrl(asset)!, slotKey, warnings };
}

export async function listAssets(siteId: string, userId: string): Promise<Record<string, unknown>[]> {
  await requireOwnedSite(siteId, userId);
  const assets = await assetsRepo.listForProject(siteId);
  return assets.map((asset) => ({
    ...withPublicUrl(asset)!,
    slotKey: assetsRepo.decodeSlotKey(asset),
  }));
}

export async function uploadsBySlot(siteId: string): Promise<Record<string, { publicUrl?: string }>> {
  const assets = await assetsRepo.listForProject(siteId);
  const out: Record<string, { publicUrl?: string }> = {};
  for (const asset of assets) {
    const slotKey = assetsRepo.decodeSlotKey(asset);
    if (!slotKey) continue;
    const url = String(asset.publicUrl ?? "");
    if (url) out[slotKey] = { publicUrl: url };
  }
  return out;
}
