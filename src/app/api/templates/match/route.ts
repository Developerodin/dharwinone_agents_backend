import { NextResponse } from "next/server";
import { requireUserId } from "@/server/builderRoute";
import { parseBody } from "@/server/api";
import { TemplateMatchRequestSchema } from "@/server/schemas/intakeSchemas";
import * as templateMatcherService from "@/server/services/templateMatcherService";

export async function POST(request: Request) {
  const uid = requireUserId(request);
  if (uid instanceof NextResponse) return uid;
  const { body, error } = await parseBody(request, TemplateMatchRequestSchema);
  if (error) return error;

  const matches = templateMatcherService.matchTemplates(body.businessProfile);
  return NextResponse.json({ matches });
}
