import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
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
  const taskId = String(run.task.id);
  const pdir = path.join(dir, "packets", taskId);
  if (!fs.existsSync(pdir)) return NextResponse.json([]);

  const out: Array<{ name: string; kind: string; ts?: unknown }> = [];
  for (const name of fs.readdirSync(pdir).sort()) {
    if (!name.endsWith(".json")) continue;
    const pkt = JSON.parse(fs.readFileSync(path.join(pdir, name), "utf-8")) as Record<string, unknown>;
    out.push({ name, kind: String(pkt.kind ?? ""), ts: pkt.ts });
  }
  return NextResponse.json(out);
}
