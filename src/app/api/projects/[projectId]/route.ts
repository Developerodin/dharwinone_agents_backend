import { NextResponse } from "next/server";
import * as legacyProjects from "@/server/legacyProjects";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params;
  const project = legacyProjects.get(projectId);
  if (!project) {
    return NextResponse.json({ detail: "project not found" }, { status: 404 });
  }
  return NextResponse.json(project);
}
