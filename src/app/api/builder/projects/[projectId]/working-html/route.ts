import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/server/api";
import { requireBuilderAction, requireBuilderProject, requireUserId } from "@/server/builderRoute";
import * as editService from "@/server/services/editService";
import * as workingHtmlRepo from "@/server/repos/workingHtmlRepo";

type Params = { params: Promise<{ projectId: string }> };

const WorkingHtmlUpdate = z.object({ html: z.string() });

export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params;
  try {
    await requireBuilderProject(projectId);
    const doc = await workingHtmlRepo.get(projectId);
    if (!doc) return NextResponse.json({ detail: "working html not found" }, { status: 404 });
    return NextResponse.json({ html: doc.html, selectedTemplateId: doc.selectedTemplateId ?? null });
  } catch (exc) {
    if (exc instanceof Error && exc.message === "project not found") {
      return NextResponse.json({ detail: exc.message }, { status: 404 });
    }
    throw exc;
  }
}

export async function PUT(request: Request, { params }: Params) {
  const uid = requireUserId(request);
  if (uid instanceof NextResponse) return uid;
  const { projectId } = await params;
  const { body, error } = await parseBody(request, WorkingHtmlUpdate);
  if (error) return error;
  try {
    await requireBuilderAction(projectId, uid, "edit");
    return NextResponse.json(await editService.saveManual(projectId, body.html));
  } catch (exc) {
    if (exc instanceof workingHtmlRepo.WorkingHtmlError) {
      return NextResponse.json({ detail: String(exc) }, { status: 422 });
    }
    if (exc instanceof Error && exc.message === "project not found") {
      return NextResponse.json({ detail: exc.message }, { status: 404 });
    }
    throw exc;
  }
}
