import { NextResponse } from "next/server";
import { requireBuilderProject } from "@/server/builderRoute";
import * as templatesRepo from "@/server/repos/templatesRepo";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params;
  try {
    await requireBuilderProject(projectId);
    return NextResponse.json(await templatesRepo.listForProject(projectId));
  } catch (exc) {
    if (exc instanceof Error && exc.message === "project not found") {
      return NextResponse.json({ detail: exc.message }, { status: 404 });
    }
    throw exc;
  }
}
