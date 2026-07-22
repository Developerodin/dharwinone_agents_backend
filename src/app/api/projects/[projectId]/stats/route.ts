// Port of backend/studio/app.py GET /projects/{project_id}/stats — a raw
// passthrough of the `<project_id>-stats.json` file (no aggregation happens
// in this handler; the stats file itself is produced elsewhere, by the
// unported runs subsystem).
import fs from "node:fs";
import { NextResponse } from "next/server";
import * as legacyProjects from "@/server/legacyProjects";
import { statsPath } from "@/server/paths";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  if (!legacyProjects.get(projectId)) {
    return NextResponse.json({ detail: "project not found" }, { status: 404 });
  }
  const p = statsPath(projectId);
  if (!fs.existsSync(p)) return NextResponse.json({});
  const raw = fs.readFileSync(p, "utf-8");
  return NextResponse.json(JSON.parse(raw));
}
