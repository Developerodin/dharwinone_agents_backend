import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/server/api";
import {
  editWorkingHtml,
  ensureBuildEditing,
  ensureRunMonitor,
  getRunOr404,
} from "@/server/runRoutes";

const EditRequest = z.object({ prompt: z.string() });

type Params = { params: Promise<{ runId: string }> };

export async function POST(request: Request, { params }: Params) {
  ensureRunMonitor();
  const { runId } = await params;
  const run = getRunOr404(runId);
  if (run instanceof NextResponse) return run;
  const editErr = ensureBuildEditing(run);
  if (editErr) return editErr;

  const { body, error } = await parseBody(request, EditRequest);
  if (error) return error;

  const result = await editWorkingHtml(run, body.prompt);
  if (result instanceof NextResponse) return result;
  return NextResponse.json(result);
}
