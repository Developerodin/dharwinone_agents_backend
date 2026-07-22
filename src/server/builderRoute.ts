import { NextResponse } from "next/server";
import { HttpError, userId } from "./api";
import * as projectsRepo from "./repos/projectsRepo";
import { requireAction } from "./policy";

export function requireUserId(request: Request): string | NextResponse {
  const uid = userId(request);
  if (!uid) return NextResponse.json({ detail: "authentication required" }, { status: 401 });
  return uid;
}

export async function requireBuilderProject(projectId: string): Promise<Record<string, unknown>> {
  const project = await projectsRepo.get(projectId);
  if (!project) throw new HttpError(404, "project not found");
  return project;
}

export async function requireBuilderAction(
  projectId: string,
  uid: string,
  action: string,
): Promise<Record<string, unknown>> {
  const project = await requireBuilderProject(projectId);
  requireAction(project, uid, action);
  return project;
}

export function authErrorResponse(exc: { status: number; detail: string | Record<string, unknown> }): NextResponse {
  return NextResponse.json({ detail: exc.detail }, { status: exc.status });
}

export function rateLimitResponse(retryAfter: number): NextResponse {
  return NextResponse.json(
    { detail: "too many requests" },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
