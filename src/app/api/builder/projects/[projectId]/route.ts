import { NextResponse } from "next/server";
import { HttpError, httpErrorResponse } from "@/server/api";
import { requireBuilderAction, requireUserId } from "@/server/builderRoute";
import * as projectsRepo from "@/server/repos/projectsRepo";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params;
  const project = await projectsRepo.get(projectId);
  if (!project) {
    return NextResponse.json({ detail: "project not found" }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const fields = (await request.json()) as Record<string, unknown>;
    const updated = await projectsRepo.updateFields(projectId, fields);
    if (!updated) throw new HttpError(404, "project not found");
    return NextResponse.json(updated);
  } catch (exc) {
    if (exc instanceof HttpError) return httpErrorResponse(exc);
    throw exc;
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const uid = requireUserId(request);
  if (uid instanceof NextResponse) return uid;
  const { projectId } = await params;
  try {
    await requireBuilderAction(projectId, uid, "delete");
    const ok = await projectsRepo.remove(projectId);
    if (!ok) return NextResponse.json({ detail: "project not found" }, { status: 404 });
    return NextResponse.json({ status: "deleted" });
  } catch (exc) {
    if (exc instanceof HttpError) return httpErrorResponse(exc);
    throw exc;
  }
}
