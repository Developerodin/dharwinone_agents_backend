import { s3Bucket, s3MockEnabled } from "../config";

const ALLOWED_PREFIXES = [
  "projects/",
  "studio/placeholders/",
  "studio/assets/",
  "studio/cache/",
  "studio/library/",
];

function validateKey(key: string): string {
  if (!key || key.startsWith("/")) throw new Error("invalid s3 key prefix");
  if (!ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    throw new Error("invalid s3 key prefix");
  }
  return key;
}

export function buildAssetKey(projectId: string, assetId: string, filename: string): string {
  const safe =
    filename
      .split("")
      .map((c) => (c.match(/[\w.-]/) ? c : "-"))
      .join("")
      .replace(/^\.+|-+$/g, "") || "asset.bin";
  return validateKey(`projects/${projectId}/assets/${assetId}/${safe}`);
}

export function createPresignedPut(
  key: string,
  contentType: string,
  expiresS = 3600,
): { url: string; method: string; headers: Record<string, string>; expiresAt: number } {
  validateKey(key);
  const expiresAt = Date.now() / 1000 + expiresS;
  if (s3MockEnabled()) {
    const bucket = s3Bucket();
    return {
      url: `mock+s3://${bucket}/${key}`,
      method: "PUT",
      headers: { "Content-Type": contentType },
      expiresAt,
    };
  }
  throw new Error("real S3 presign not configured in Next.js backend yet");
}

export function publicAssetUrl(key: string): string | null {
  if (!key) return null;
  if (key.startsWith("http://") || key.startsWith("https://")) return key;
  const normalized = key.replace(/^\//, "");
  const base = (process.env.STUDIO_ASSET_PUBLIC_BASE_URL ?? "").trim().replace(/\/$/, "");
  if (base) {
    const safeKey = normalized
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    return `${base}/${safeKey}`;
  }
  if (s3MockEnabled()) return null;
  const bucket = s3Bucket();
  const region = (process.env.AWS_REGION ?? "").trim();
  if (region) return `https://${bucket}.s3.${region}.amazonaws.com/${normalized}`;
  return `https://${bucket}.s3.amazonaws.com/${normalized}`;
}
