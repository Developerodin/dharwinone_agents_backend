import { NextResponse } from "next/server";
import type { ZodType } from "zod";

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for") ?? "";
  return fwd.split(",")[0].trim() || "unknown";
}

export function requestBaseUrl(request: Request): string {
  const proto = (request.headers.get("x-forwarded-proto") ?? "").split(",")[0].trim();
  const host = (request.headers.get("x-forwarded-host") ?? "").split(",")[0].trim();
  if (proto && host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

export async function parseBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<{ body: T; error: null } | { body: null; error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { body: null, error: NextResponse.json({ detail: "invalid JSON body" }, { status: 422 }) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      body: null,
      error: NextResponse.json({ detail: parsed.error.issues }, { status: 422 }),
    };
  }
  return { body: parsed.data, error: null };
}

export function userId(request: Request): string {
  return request.headers.get("x-user-id") ?? "";
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(detail);
  }
}

export function httpErrorResponse(exc: HttpError): NextResponse {
  let detail: unknown = exc.detail;
  try {
    detail = JSON.parse(exc.detail);
  } catch {
    /* keep string detail */
  }
  return NextResponse.json({ detail }, { status: exc.status });
}
