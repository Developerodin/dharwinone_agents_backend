import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/server/api";
import { requireBuilderAction, requireUserId } from "@/server/builderRoute";
import * as publishService from "@/server/services/publishService";

type Params = { params: Promise<{ projectId: string }> };

const PublishRequest = z.object({
  channel: z.string().optional(),
  versionId: z.string().nullable().optional(),
});

export async function POST(request: Request, { params }: Params) {
  const uid = requireUserId(request);
  if (uid instanceof NextResponse) return uid;
  const { projectId } = await params;
  const { body, error } = await parseBody(request, PublishRequest);
  if (error) return error;
  try {
    await requireBuilderAction(projectId, uid, "publish");
    const release = await publishService.publish(
      projectId,
      body.channel ?? "preview",
      body.versionId ?? null,
    );
    return NextResponse.json(release);
  } catch (exc) {
    if (exc instanceof Error) {
      if (exc.message === "project not found") {
        return NextResponse.json({ detail: exc.message }, { status: 404 });
      }
      if (exc.message === "quality gate failed") {
        return NextResponse.json({ detail: exc.message }, { status: 422 });
      }
    }
    throw exc;
  }
}
