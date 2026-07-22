import { NextResponse } from "next/server";
import * as preview from "@/server/preview";
import { ensureRunMonitor, getRunOr404 } from "@/server/runRoutes";

type Params = { params: Promise<{ runId: string }> };

export async function POST(_request: Request, { params }: Params) {
  ensureRunMonitor();
  const { runId } = await params;
  const run = getRunOr404(runId);
  if (run instanceof NextResponse) return run;
  try {
    return NextResponse.json(await preview.start(run));
  } catch (exc) {
    return NextResponse.json({ detail: String(exc) }, { status: 404 });
  }
}

export async function GET(_request: Request, { params }: Params) {
  ensureRunMonitor();
  const { runId } = await params;
  const run = getRunOr404(runId);
  if (run instanceof NextResponse) return run;
  return NextResponse.json(preview.getStatus(runId));
}

export async function DELETE(_request: Request, { params }: Params) {
  ensureRunMonitor();
  const { runId } = await params;
  const run = getRunOr404(runId);
  if (run instanceof NextResponse) return run;
  return NextResponse.json(preview.stop(runId));
}
