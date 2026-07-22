import path from "node:path";
import { NextResponse } from "next/server";
import { journalRead } from "@/server/packets";
import { ensureRunMonitor, getRunOr404 } from "@/server/runRoutes";
import { findRunDir } from "@/server/runs";

type Params = { params: Promise<{ runId: string }> };

export async function GET(_request: Request, { params }: Params) {
  ensureRunMonitor();
  const { runId } = await params;
  const run = getRunOr404(runId);
  if (run instanceof NextResponse) return run;

  const dir = findRunDir(runId);
  if (!dir) return NextResponse.json({ detail: "run directory not found" }, { status: 404 });
  return NextResponse.json(journalRead(path.join(dir, "journal.jsonl")));
}
