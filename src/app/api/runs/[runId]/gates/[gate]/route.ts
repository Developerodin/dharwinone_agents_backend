import { NextResponse } from "next/server";
import path from "node:path";
import { z } from "zod";
import { parseBody } from "@/server/api";
import * as gates from "@/server/gates";
import { ensureRunMonitor, getRunOr404 } from "@/server/runRoutes";
import { findRunDir } from "@/server/runs";

const GateDecision = z.object({
  decision: z.string(),
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
});

type Params = { params: Promise<{ runId: string; gate: string }> };

export async function POST(request: Request, { params }: Params) {
  ensureRunMonitor();
  const { runId, gate } = await params;
  const run = getRunOr404(runId);
  if (run instanceof NextResponse) return run;

  const runDir = findRunDir(runId);
  if (!runDir) return NextResponse.json({ detail: "run directory not found" }, { status: 404 });

  const journalPath = path.join(runDir, "journal.jsonl");
  if (!gates.isGateOpen(journalPath, gate)) {
    return NextResponse.json({ detail: "gate not open" }, { status: 409 });
  }

  const { body, error } = await parseBody(request, GateDecision);
  if (error) return error;

  gates.writeApproval(runDir, gate, body.decision, body.payload ?? null);
  return NextResponse.json({ ok: true });
}
