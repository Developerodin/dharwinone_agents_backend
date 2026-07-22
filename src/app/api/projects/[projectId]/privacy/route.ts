// Port of backend/studio/app.py GET/PUT /projects/{project_id}/privacy.
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/server/api";
import * as legacyProjects from "@/server/legacyProjects";

const PrivacyUpdateRequest = z.object({
  privacy: z.string(),
  stage_consents: z.array(z.string()).nullable().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const project = legacyProjects.get(projectId);
  if (!project) return NextResponse.json({ detail: "project not found" }, { status: 404 });
  return NextResponse.json({
    privacy: (project.privacy as string | undefined) ?? "local_only",
    stage_consents: (project.stage_consents as string[] | undefined) ?? [],
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const project = legacyProjects.get(projectId);
  if (!project) return NextResponse.json({ detail: "project not found" }, { status: 404 });
  const { body, error } = await parseBody(request, PrivacyUpdateRequest);
  if (error) return error;

  project.privacy = body.privacy;
  if (body.stage_consents != null) project.stage_consents = body.stage_consents;

  const all = legacyProjects.loadAll();
  const idx = all.findIndex((p) => p.id === projectId);
  if (idx !== -1) all[idx] = project;
  legacyProjects.saveAll(all);

  return NextResponse.json({ privacy: project.privacy, stage_consents: project.stage_consents });
}
