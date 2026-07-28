import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Secret used to mint draft share links (reuses auth JWT secret).
 */
function shareSecret(): string {
  const value = process.env.AUTH_JWT_SECRET?.trim();
  if (!value) throw new Error("AUTH_JWT_SECRET is not set");
  return value;
}

/**
 * Build an HMAC signature for a site share token.
 */
function signSiteId(siteId: string): string {
  return createHmac("sha256", shareSecret())
    .update(`site-share-v1:${siteId}`)
    .digest("base64url");
}

/**
 * Mint a share token for a draft site (no publish required).
 * Format: `{siteId}.{hmac}`
 */
export function mintShareToken(siteId: string): string {
  const id = siteId.trim();
  if (!id) throw new Error("siteId required");
  return `${id}.${signSiteId(id)}`;
}

/**
 * Verify a share token and return the siteId, or null if invalid.
 */
export function parseShareToken(token: string): string | null {
  const raw = token.trim();
  const i = raw.lastIndexOf(".");
  if (i <= 0 || i === raw.length - 1) return null;
  const siteId = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  if (!siteId || !sig) return null;

  const expected = signSiteId(siteId);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return siteId;
}

/**
 * Absolute public draft share URL on the app (frontend) host.
 * Share must render via launch templates on the dashboard app — not the
 * backend generic SiteRenderer (which looks like a different site).
 */
export function buildShareUrl(siteId: string, appBase: string): string {
  const token = mintShareToken(siteId);
  const base = appBase.replace(/\/$/, "");
  return `${base}/sites/preview/share/${encodeURIComponent(token)}`;
}

/**
 * Resolve the public app base (frontend) for share links.
 * Prefer APP_BASE_URL so links open the real user template renderer.
 */
export function appPublicBase(request?: Request): string {
  const fromEnv = (
    process.env.APP_BASE_URL?.trim() ||
    process.env.PUBLIC_APP_BASE?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    ""
  );
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  if (request) {
    const origin = request.headers.get("origin");
    if (origin?.trim()) return origin.trim().replace(/\/$/, "");
  }

  return "http://localhost:3000";
}

/**
 * @deprecated Use {@link appPublicBase} for share URLs. Kept for Sites API host resolution.
 */
export function sitesPublicBase(request?: Request): string {
  const fromEnv = (
    process.env.PUBLIC_SITES_BASE?.trim() ||
    process.env.NEXT_PUBLIC_SITES_API?.trim() ||
    ""
  );
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  if (request) {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const proto =
      request.headers.get("x-forwarded-proto") ||
      (host?.includes("localhost") || host?.startsWith("127.") ? "http" : "https");
    if (host) return `${proto}://${host}`.replace(/\/$/, "");
  }

  const port = process.env.NEXT_PORT?.trim() || process.env.STUDIO_PORT?.trim() || "8787";
  return `http://127.0.0.1:${port}`;
}
