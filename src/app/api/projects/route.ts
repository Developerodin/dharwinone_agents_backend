import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/server/api";
import * as legacyProjects from "@/server/legacyProjects";

const ProjectCreateRequest = z.object({
  name: z.string(),
  repo_root: z.string(),
  integration_branch: z.string().nullable().optional(),
  dev_cmd: z.string().nullable().optional(),
  dev_port_range: z.array(z.number()).nullable().optional(),
  accept_templates: z.record(z.string(), z.array(z.string())).nullable().optional(),
});

export function GET() {
  return NextResponse.json(legacyProjects.loadAll());
}

export async function POST(request: Request) {
  const { body, error } = await parseBody(request, ProjectCreateRequest);
  if (error) return error;
  try {
    const project = legacyProjects.create(body);
    return NextResponse.json(project, { status: 201 });
  } catch (exc) {
    if (exc instanceof legacyProjects.ProjectError) {
      return NextResponse.json({ detail: exc.message }, { status: 422 });
    }
    throw exc;
  }
}
