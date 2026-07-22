import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/server/api";
import * as legacyProjects from "@/server/legacyProjects";
import { ensureRunMonitor } from "@/server/runRoutes";
import * as runs from "@/server/runs";

const RunCreateRequest = z.object({
  prompt: z.string(),
  lane: z.string().optional(),
  title: z.string().nullable().optional(),
  allow_paths: z.array(z.string()).nullable().optional(),
  accept_template: z.string().nullable().optional(),
  accept_args: z.array(z.string()).nullable().optional(),
  force: z.boolean().optional(),
});

type Params = { params: Promise<{ projectId: string }> };

export async function POST(request: Request, { params }: Params) {
  ensureRunMonitor();
  const { projectId } = await params;
  const project = legacyProjects.get(projectId);
  if (!project) return NextResponse.json({ detail: "project not found" }, { status: 404 });

  const { body, error } = await parseBody(request, RunCreateRequest);
  if (error) return error;

  const [runData, code] = runs.start(project, body);
  if (code === 423) return NextResponse.json({ detail: "run already active" }, { status: 423 });
  return NextResponse.json({ run_id: runData!.run_id }, { status: 201 });
}
