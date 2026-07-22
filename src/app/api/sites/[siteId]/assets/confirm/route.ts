import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, httpErrorResponse, parseBody, userId } from "@/server/api";
import * as siteAssetService from "@/server/services/siteAssetService";

type Params = { params: Promise<{ siteId: string }> };

const ConfirmRequest = z.object({
  assetId: z.string(),
  s3Key: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive().optional().nullable(),
  height: z.number().int().positive().optional().nullable(),
  slotKey: z.string().optional(),
  assetType: z.string().optional(),
});

function requireUserId(request: Request): string | NextResponse {
  const uid = userId(request);
  if (!uid) return NextResponse.json({ detail: "authentication required" }, { status: 401 });
  return uid;
}

export async function POST(request: Request, { params }: Params) {
  const uid = requireUserId(request);
  if (uid instanceof NextResponse) return uid;
  const { siteId } = await params;
  const { body, error } = await parseBody(request, ConfirmRequest);
  if (error) return error;

  try {
    return NextResponse.json(
      await siteAssetService.confirmUpload(siteId, uid, {
        assetId: body.assetId,
        s3Key: body.s3Key,
        contentType: body.contentType,
        sizeBytes: body.sizeBytes,
        width: body.width,
        height: body.height,
        slotKey: body.slotKey,
        assetType: body.assetType,
      }),
    );
  } catch (exc) {
    if (exc instanceof siteAssetService.SiteAssetValidationError) {
      const status = exc.message === "forbidden" ? 403 : exc.message === "site not found" ? 404 : 422;
      return NextResponse.json({ detail: exc.message }, { status });
    }
    if (exc instanceof HttpError) return httpErrorResponse(exc);
    throw exc;
  }
}
