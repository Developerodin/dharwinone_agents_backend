import { NextResponse, type NextRequest } from "next/server";
import { verifyJwt } from "@/server/security";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const ALLOWED_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

function resolveCorsOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (ALLOWED_ORIGINS.has(origin) || ALLOWED_ORIGIN_RE.test(origin)) return origin;
  return null;
}

function withCors(request: NextRequest, response: NextResponse): NextResponse {
  const origin = resolveCorsOrigin(request.headers.get("origin"));
  if (origin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Vary", "Origin");
  }
  return response;
}

const PUBLIC_PATHS = new Set([
  "/api/auth/register",
  "/api/auth/verify",
  "/api/auth/login",
  "/api/auth/resend-verification",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/auth/register",
  "/auth/verify",
  "/auth/login",
  "/auth/resend-verification",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/api/health",
  "/api/ping",
  "/api/token-packs",
  "/api/payments/razorpay/webhook",
  "/health",
  "/ping",
]);

const PUBLIC_PREFIXES = ["/api/public/", "/sites/preview/"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (request.method === "OPTIONS") {
    const preflight = new NextResponse(null, { status: 204 });
    const origin = resolveCorsOrigin(request.headers.get("origin"));
    if (origin) {
      preflight.headers.set("Access-Control-Allow-Origin", origin);
      preflight.headers.set("Access-Control-Allow-Credentials", "true");
      preflight.headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      );
      preflight.headers.set(
        "Access-Control-Allow-Headers",
        request.headers.get("access-control-request-headers") ?? "Content-Type, Authorization",
      );
      preflight.headers.set("Access-Control-Max-Age", "86400");
      preflight.headers.set("Vary", "Origin");
    }
    return preflight;
  }

  if (isPublicPath(pathname)) {
    return withCors(request, NextResponse.next());
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    return withCors(
      request,
      NextResponse.json({ detail: "authentication required" }, { status: 401 }),
    );
  }

  try {
    const uid = await verifyJwt(token);
    const headers = new Headers(request.headers);
    headers.set("x-user-id", uid);
    return withCors(request, NextResponse.next({ request: { headers } }));
  } catch {
    return withCors(
      request,
      NextResponse.json({ detail: "invalid or expired token" }, { status: 401 }),
    );
  }
}

export const config = {
  matcher: [
    "/api/:path*",
    "/auth/:path*",
    "/health",
    "/ping",
    "/projects",
    "/projects/:path*",
    "/builder/:path*",
    "/runs",
    "/runs/:path*",
    "/tokens/:path*",
    "/sites",
    "/sites/:path*",
    "/categories",
    "/templates",
    "/templates/:path*",
  ],
};
