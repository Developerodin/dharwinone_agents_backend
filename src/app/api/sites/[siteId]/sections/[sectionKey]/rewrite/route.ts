import { NextResponse } from "next/server";
import { requireUserId } from "@/server/builderRoute";
import { z } from "zod";
import { HttpError, httpErrorResponse, parseBody } from "@/server/api";
import { enforceAiRateLimit } from "@/server/aiRateLimit";
import * as siteSectionService from "@/server/services/siteSectionService";
import * as tokenService from "@/server/services/tokenService";

type Params = { params: Promise<{ siteId: string; sectionKey: string }> };

const Body = z.object({
  idempotencyKey: z.string().min(8),
  instruction: z.string().min(1).max(500),
});

export async function POST(request: Request, { params }: Params) {
  const uid = requireUserId(request);
  if (uid instanceof NextResponse) return uid;
  const limited = enforceAiRateLimit(request, uid);
  if (limited) return limited;
  const { siteId, sectionKey } = await params;
  const { body, error } = await parseBody(request, Body);
  if (error) return error;

  try {
    const result = await siteSectionService.mutateSection({
      siteId,
      userId: uid,
      sectionKey,
      actionType: "ai_rewrite",
      idempotencyKey: body.idempotencyKey,
      instruction: body.instruction,
    });
    return NextResponse.json(result);
  } catch (exc) {
    if (exc instanceof tokenService.InsufficientTokensError) {
      return NextResponse.json(
        { detail: exc.message, balance: exc.balance, cost: exc.cost },
        { status: 402 },
      );
    }
    if (exc instanceof HttpError) return httpErrorResponse(exc);
    throw exc;
  }
}
