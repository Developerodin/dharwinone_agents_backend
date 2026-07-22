import { NextResponse } from "next/server";
import { requireBuilderProject } from "@/server/builderRoute";
import * as analyticsRepo from "@/server/repos/analyticsRepo";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params;
  await requireBuilderProject(projectId);
  return NextResponse.json(await analyticsRepo.summarize(projectId));
}
