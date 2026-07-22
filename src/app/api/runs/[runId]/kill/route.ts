import { NextResponse } from "next/server";
import { ensureRunMonitor, getRunOr404 } from "@/server/runRoutes";
import * as runs from "@/server/runs";

type Params = { params: Promise<{ runId: string }> };

export async function POST(_request: Request, { params }: Params) {
  ensureRunMonitor();
  const { runId } = await params;
  const run = getRunOr404(runId);
  if (run instanceof NextResponse) return run;
  return NextResponse.json(runs.kill(run));
}
