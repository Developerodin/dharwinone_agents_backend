import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, userId } from "@/server/api";
import { GapCheckRequestSchema } from "@/server/schemas/intakeSchemas";
import * as intakeService from "@/server/services/intakeService";
import * as tokenService from "@/server/services/tokenService";

function requireUserId(request: Request): string | NextResponse {
  const uid = userId(request);
  if (!uid) return NextResponse.json({ detail: "authentication required" }, { status: 401 });
  return uid;
}

export async function POST(request: Request) {
  const uid = requireUserId(request);
  if (uid instanceof NextResponse) return uid;
  const { body, error } = await parseBody(request, GapCheckRequestSchema);
  if (error) return error;

  try {
    const result = await intakeService.gapCheckForCategory(body.businessProfile, body.categoryId);
    return NextResponse.json({
      ...result,
      cost: tokenService.actionCost("gap_check"),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ detail: err.message }, { status: 422 });
    }
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("unknown category")) {
      return NextResponse.json({ detail: message }, { status: 404 });
    }
    throw err;
  }
}
