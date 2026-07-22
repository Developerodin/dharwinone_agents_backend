import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, userId } from "@/server/api";
import * as projectsRepo from "@/server/repos/projectsRepo";

const BuilderProjectCreateRequest = z.object({
  projectName: z.string(),
  initialPrompt: z.string().nullable().optional(),
});

function requireUserId(request: Request): string | NextResponse {
  const uid = userId(request);
  if (!uid) {
    return NextResponse.json({ detail: "authentication required" }, { status: 401 });
  }
  return uid;
}

export async function GET(request: Request) {
  const uid = requireUserId(request);
  if (uid instanceof NextResponse) return uid;
  return NextResponse.json(await projectsRepo.listForUser(uid));
}

export async function POST(request: Request) {
  const uid = requireUserId(request);
  if (uid instanceof NextResponse) return uid;
  const { body, error } = await parseBody(request, BuilderProjectCreateRequest);
  if (error) return error;
  const project = await projectsRepo.create(body.projectName, body.initialPrompt ?? null, uid);
  return NextResponse.json(project, { status: 201 });
}
