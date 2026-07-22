import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/server/api";
import { requireBuilderAction, requireUserId } from "@/server/builderRoute";
import * as versionService from "@/server/services/versionService";

type Params = { params: Promise<{ projectId: string }> };

const RestoreVersionRequest = z.object({ versionId: z.string() });

export async function POST(request: Request, { params }: Params) {
  const uid = requireUserId(request);
  if (uid instanceof NextResponse) return uid;
  const { projectId } = await params;
  const { body, error } = await parseBody(request, RestoreVersionRequest);
  if (error) return error;
  try {
    await requireBuilderAction(projectId, uid, "restore");
    return NextResponse.json(await versionService.restore(projectId, body.versionId));
  } catch (exc) {
    if (exc instanceof versionService.VersionError) {
      return NextResponse.json({ detail: String(exc) }, { status: 404 });
    }
    if (exc instanceof Error && exc.message === "project not found") {
      return NextResponse.json({ detail: exc.message }, { status: 404 });
    }
    throw exc;
  }
}
