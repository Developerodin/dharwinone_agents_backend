import { NextResponse } from "next/server";
import * as legacyProjects from "@/server/legacyProjects";
import { ensureRunMonitor } from "@/server/runRoutes";
import * as runs from "@/server/runs";

export function GET(request: Request) {
  ensureRunMonitor();
  const project = new URL(request.url).searchParams.get("project");
  if (!project || !legacyProjects.get(project)) {
    return NextResponse.json({ detail: "project not found" }, { status: 404 });
  }
  return NextResponse.json(runs.listRuns(project));
}
