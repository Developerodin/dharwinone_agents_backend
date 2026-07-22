// Port of backend/studio/app.py GET/PUT /projects/{project_id}/knowledge.
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/server/api";
import * as legacyProjects from "@/server/legacyProjects";
import * as knowledge from "@/server/knowledge";

const KnowledgeBody = z.record(z.string(), z.unknown());

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const project = legacyProjects.get(projectId);
  if (!project) return NextResponse.json({ detail: "project not found" }, { status: 404 });
  try {
    return NextResponse.json(knowledge.read(project));
  } catch (exc) {
    if (exc instanceof knowledge.KnowledgeError) {
      return NextResponse.json({ detail: exc.message }, { status: 422 });
    }
    throw exc;
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const project = legacyProjects.get(projectId);
  if (!project) return NextResponse.json({ detail: "project not found" }, { status: 404 });
  const { body, error } = await parseBody(request, KnowledgeBody);
  if (error) return error;
  try {
    return NextResponse.json(knowledge.write(project, body));
  } catch (exc) {
    if (exc instanceof knowledge.KnowledgeError) {
      return NextResponse.json({ detail: exc.message }, { status: 422 });
    }
    throw exc;
  }
}
