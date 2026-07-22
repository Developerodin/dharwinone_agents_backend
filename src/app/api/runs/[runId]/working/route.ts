import fs from "node:fs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/server/api";
import {
  ensureBuildEditing,
  ensureRunMonitor,
  getRunOr404,
  validateWorkingHtml,
  workingPath,
  writeWorkingHtml,
} from "@/server/runRoutes";

const WorkingDraftUpdate = z.object({ html: z.string() });

type Params = { params: Promise<{ runId: string }> };

export async function GET(_request: Request, { params }: Params) {
  ensureRunMonitor();
  const { runId } = await params;
  const run = getRunOr404(runId);
  if (run instanceof NextResponse) return run;
  const wp = workingPath(runId);
  if (wp instanceof NextResponse) return wp;
  const [, working] = wp;
  if (!fs.existsSync(working)) {
    return NextResponse.json({ detail: "working draft not found" }, { status: 404 });
  }
  return NextResponse.json({ html: fs.readFileSync(working, "utf-8") });
}

export async function PUT(request: Request, { params }: Params) {
  ensureRunMonitor();
  const { runId } = await params;
  const run = getRunOr404(runId);
  if (run instanceof NextResponse) return run;
  const editErr = ensureBuildEditing(run);
  if (editErr) return editErr;

  const { body, error } = await parseBody(request, WorkingDraftUpdate);
  if (error) return error;
  const validation = validateWorkingHtml(body.html);
  if (validation) return validation;
  return writeWorkingHtml(run, body.html);
}
