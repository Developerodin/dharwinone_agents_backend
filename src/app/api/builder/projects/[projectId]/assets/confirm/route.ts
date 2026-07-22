import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/server/api";
import * as assetService from "@/server/services/assetService";

type Params = { params: Promise<{ projectId: string }> };

const ConfirmRequest = z.object({
  assetId: z.string(),
  s3Key: z.string(),
  contentType: z.string(),
  sizeBytes: z.number(),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
});

export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params;
  const { body, error } = await parseBody(request, ConfirmRequest);
  if (error) return error;
  try {
    return NextResponse.json(
      await assetService.confirmUpload(projectId, {
        assetId: body.assetId,
        s3Key: body.s3Key,
        contentType: body.contentType,
        sizeBytes: body.sizeBytes,
        width: body.width,
        height: body.height,
      }),
    );
  } catch (exc) {
    if (exc instanceof assetService.AssetValidationError) {
      return NextResponse.json({ detail: String(exc) }, { status: 422 });
    }
    if (exc instanceof Error && exc.message === "project not found") {
      return NextResponse.json({ detail: exc.message }, { status: 404 });
    }
    throw exc;
  }
}
