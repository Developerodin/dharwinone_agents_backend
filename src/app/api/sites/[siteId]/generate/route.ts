import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, httpErrorResponse, parseBody, userId } from "@/server/api";
import { enforceAiRateLimit } from "@/server/aiRateLimit";
import * as sitesRepo from "@/server/repos/sitesRepo";
import * as contentAgentService from "@/server/services/contentAgentService";
import * as imageResolver from "@/server/services/imageResolverService";
import { getImagePackRefsForProfile } from "@/server/data/categoryCatalog";
import {
  assertModerationAllowed,
  ModerationBlockedError,
} from "@/server/services/moderationService";
import * as tokenService from "@/server/services/tokenService";

type Params = { params: Promise<{ siteId: string }> };

const GenerateRequest = z.object({
  sectionSchema: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().min(8),
});

function requireUserId(request: Request): string | NextResponse {
  const uid = userId(request);
  if (!uid) return NextResponse.json({ detail: "authentication required" }, { status: 401 });
  return uid;
}

async function requireOwnedSite(siteId: string, uid: string) {
  const site = await sitesRepo.get(siteId);
  if (!site) throw new HttpError(404, "site not found");
  if (site.userId !== uid) throw new HttpError(403, "forbidden");
  return site;
}

export async function POST(request: Request, { params }: Params) {
  const uid = requireUserId(request);
  if (uid instanceof NextResponse) return uid;
  const limited = enforceAiRateLimit(request, uid);
  if (limited) return limited;
  const { siteId } = await params;
  const { body, error } = await parseBody(request, GenerateRequest);
  if (error) return error;

  try {
    const site = await requireOwnedSite(siteId, uid);
    const profileRaw = (site.businessProfileJson as Record<string, unknown>) ?? {};
    const profile = {
      ...profileRaw,
      image_pack_refs: getImagePackRefsForProfile(profileRaw),
    };
    const theme = (site.themeJson as Record<string, unknown> | undefined) ?? {};
    const moderation = await assertModerationAllowed(profile);
    const result = await tokenService.withTokenHold({
      userId: uid,
      actionType: "full_generation",
      idempotencyKey: body.idempotencyKey,
      siteId,
      fn: () =>
        contentAgentService.generateSiteContent({
          businessProfile: profile,
          sectionSchema: body.sectionSchema,
        }),
      // spec §11: degraded fallback content is not billed — refund the hold but still
      // return the fallback site to the caller (200, usedFallback: true).
      shouldRefund: (r) => r.usedFallback === true,
    });

    const withImages = imageResolver.injectResolvedImagesIntoContent({
      content: result.content,
      theme,
      businessProfile: profile,
    });

    const updated = await sitesRepo.updateFields(siteId, {
      contentJson: withImages.content,
      themeJson: withImages.theme,
      businessProfileJson: profile,
    });

    return NextResponse.json({
      site: updated,
      usedFallback: result.usedFallback,
      cost: tokenService.actionCost("full_generation"),
      moderation,
    });
  } catch (exc) {
    if (exc instanceof ModerationBlockedError) {
      return NextResponse.json(
        { detail: exc.message, moderation: exc.result },
        { status: 403 },
      );
    }
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
