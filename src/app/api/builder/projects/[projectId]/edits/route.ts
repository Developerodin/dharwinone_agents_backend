import { NextResponse } from "next/server";
import { requireBuilderProject } from "@/server/builderRoute";
import * as editsRepo from "@/server/repos/editsRepo";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params;
  await requireBuilderProject(projectId);
  return NextResponse.json(await editsRepo.listForProject(projectId));
}
