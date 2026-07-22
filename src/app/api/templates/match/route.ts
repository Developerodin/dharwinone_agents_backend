import { NextResponse } from "next/server";
import { parseBody, userId } from "@/server/api";
import { TemplateMatchRequestSchema } from "@/server/schemas/intakeSchemas";
import * as templateMatcherService from "@/server/services/templateMatcherService";

function requireUserId(request: Request): string | NextResponse {
  const uid = userId(request);
  if (!uid) return NextResponse.json({ detail: "authentication required" }, { status: 401 });
  return uid;
}

export async function POST(request: Request) {
  const uid = requireUserId(request);
  if (uid instanceof NextResponse) return uid;
  const { body, error } = await parseBody(request, TemplateMatchRequestSchema);
  if (error) return error;

  const matches = templateMatcherService.matchTemplates(body.businessProfile);
  return NextResponse.json({ matches });
}
