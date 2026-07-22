import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { ensureRunMonitor, getRunOr404 } from "@/server/runRoutes";
import { findRunDir } from "@/server/runs";

type Params = { params: Promise<{ runId: string; name: string }> };

export async function GET(_request: Request, { params }: Params) {
  ensureRunMonitor();
  const { runId, name: rawName } = await params;
  const run = getRunOr404(runId);
  if (run instanceof NextResponse) return run;

  let name = rawName;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) {
    return NextResponse.json({ detail: "packet not found" }, { status: 404 });
  }
  if (!name.endsWith(".json") && !name.endsWith(".md")) {
    name = `${name.toLowerCase()}.json`;
  }

  const dir = findRunDir(runId);
  if (!dir) return NextResponse.json({ detail: "run directory not found" }, { status: 404 });
  const taskId = String(run.task.id);
  const filePath = path.join(dir, "packets", taskId, name);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ detail: "packet not found" }, { status: 404 });
  }

  const content = fs.readFileSync(filePath, "utf-8");
  if (name.endsWith(".md")) {
    return new Response(content, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
  }
  return NextResponse.json(JSON.parse(content));
}
