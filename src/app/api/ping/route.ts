import { NextResponse } from "next/server";

/** Lightweight liveness probe — mirrors telephony /health shape. */
export function GET() {
  return NextResponse.json({ ok: true, service: "dharwin-backend" });
}
