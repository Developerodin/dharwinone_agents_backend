import { NextResponse } from "next/server";
import { databaseUrl, port, s3MockEnabled } from "@/server/config";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "dharwin-backend",
    runtime: "nextjs",
    studioPort: port(),
    databaseConfigured: Boolean(databaseUrl()),
    s3Mock: s3MockEnabled(),
  });
}
