import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/server/api";
import * as assetService from "@/server/services/assetService";

type Params = { params: Promise<{ projectId: string }> };

const PresignRequest = z.object({
  filename: z.string(),
  contentType: z.string(),
  assetType: z.string(),
});

export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params;
  const { body, error } = await parseBody(request, PresignRequest);
  if (error) return error;
  try {
    return NextResponse.json(
      await assetService.createPresign(projectId, {
        filename: body.filename,
        contentType: body.contentType,
        assetType: body.assetType,
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
