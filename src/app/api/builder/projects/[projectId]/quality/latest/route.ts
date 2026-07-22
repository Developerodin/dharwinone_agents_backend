import { NextResponse } from "next/server";
import { requireBuilderProject } from "@/server/builderRoute";
import * as publishService from "@/server/services/publishService";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params;
  await requireBuilderProject(projectId);
  const result = await publishService.latestQuality(projectId);
  if (!result) return NextResponse.json({ detail: "no quality run yet" }, { status: 404 });
  return NextResponse.json(result);
}
