import { NextResponse } from "next/server";
import { requireBuilderAction, requireUserId } from "@/server/builderRoute";
import * as selectionService from "@/server/services/selectionService";

type Params = { params: Promise<{ projectId: string; templateId: string }> };

export async function POST(request: Request, { params }: Params) {
  const uid = requireUserId(request);
  if (uid instanceof NextResponse) return uid;
  const { projectId, templateId } = await params;
  try {
    await requireBuilderAction(projectId, uid, "edit");
    return NextResponse.json(await selectionService.selectTemplate(projectId, templateId));
  } catch (exc) {
    if (exc instanceof Error) {
      if (exc.message === "project not found" || exc.message.includes("not found")) {
        return NextResponse.json({ detail: exc.message }, { status: 404 });
      }
    }
    throw exc;
  }
}
