import { NextResponse } from "next/server";
import { requireUserId } from "@/server/builderRoute";
import { parseBody } from "@/server/api";
import { PrefillRequestSchema } from "@/server/schemas/intakeSchemas";
import * as intakeService from "@/server/services/intakeService";
import * as tokenService from "@/server/services/tokenService";

export async function POST(request: Request) {
  const uid = requireUserId(request);
  if (uid instanceof NextResponse) return uid;
  const { body, error } = await parseBody(request, PrefillRequestSchema);
  if (error) return error;

  const result = await intakeService.prefillIntake(body);
  return NextResponse.json({
    businessProfile: result.profile,
    source: result.source,
    cost: tokenService.actionCost("intake_prefill"),
  });
}
