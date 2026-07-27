import { NextResponse } from "next/server";
import { userId } from "./api";

export function requireUserId(request: Request): string | NextResponse {
  const uid = userId(request);
  if (!uid) return NextResponse.json({ detail: "authentication required" }, { status: 401 });
  return uid;
}

export function authErrorResponse(exc: { status: number; detail: string | Record<string, unknown> }): NextResponse {
  return NextResponse.json({ detail: exc.detail }, { status: exc.status });
}

export function rateLimitResponse(retryAfter: number): NextResponse {
  return NextResponse.json(
    { detail: "too many requests" },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
