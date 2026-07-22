// Port of backend/studio/app.py GET /projects/{project_id}/consent-ledger.
import { NextResponse } from "next/server";
import * as legacyProjects from "@/server/legacyProjects";
import * as consent from "@/server/consent";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  if (!legacyProjects.get(projectId)) {
    return NextResponse.json({ detail: "project not found" }, { status: 404 });
  }
  return NextResponse.json(consent.readLedger(projectId));
}
