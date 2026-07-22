import { NextResponse } from "next/server";
import { ensureRunMonitor, getRunOr404 } from "@/server/runRoutes";

type Params = { params: Promise<{ runId: string }> };

export async function GET(_request: Request, { params }: Params) {
  ensureRunMonitor();
  const { runId } = await params;
  const run = getRunOr404(runId);
  if (run instanceof NextResponse) return run;
  return NextResponse.json(run);
}
