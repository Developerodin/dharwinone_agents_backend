import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Bucket, s3MockEnabled } from "../config";

let _client: S3Client | null = null;
function client(): S3Client {
  if (!_client) {
    const region = (process.env.AWS_REGION ?? "").trim() || undefined;
    const accessKeyId = (process.env.AWS_ACCESS_KEY_ID ?? "").trim();
    const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY ?? "").trim();
    _client = new S3Client({
      region,
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
    });
  }
  return _client;
}

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
      .replace(/[^\w.-]/g, "-")
      .replace(/^\.+|-+$/g, "") || "asset.bin";
  return validateKey(`projects/${projectId}/assets/${assetId}/${safe}`);
}

export async function createPresignedPut(
  key: string,
  contentType: string,
  expiresS = 3600,
): Promise<{ url: string; method: string; headers: Record<string, string>; expiresAt: number }> {
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
  // Real SigV4 presigned PUT. ContentType is signed, so the browser PUT must send
  // exactly this Content-Type header (uploadSiteImage forwards `headers` verbatim).
  const url = await getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: s3Bucket(), Key: key, ContentType: contentType }),
    { expiresIn: expiresS },
  );
  return { url, method: "PUT", headers: { "Content-Type": contentType }, expiresAt };
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
