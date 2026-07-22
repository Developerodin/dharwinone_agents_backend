import { NextResponse } from "next/server";
import { requireBuilderProject } from "@/server/builderRoute";
import * as publishService from "@/server/services/publishService";

type Params = { params: Promise<{ projectId: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { projectId } = await params;
  try {
    await requireBuilderProject(projectId);
    return NextResponse.json(await publishService.runQualityGate(projectId));
  } catch (exc) {
    if (exc instanceof Error && exc.message === "project not found") {
      return NextResponse.json({ detail: exc.message }, { status: 404 });
    }
    if (exc instanceof Error && exc.message.includes("working html")) {
      return NextResponse.json({ detail: exc.message }, { status: 422 });
    }
    throw exc;
  }
}
