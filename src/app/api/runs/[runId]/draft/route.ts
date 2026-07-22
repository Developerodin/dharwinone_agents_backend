import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { ensureRunMonitor, getRunOr404 } from "@/server/runRoutes";
import { findRunDir } from "@/server/runs";

type Params = { params: Promise<{ runId: string }> };

export async function GET(request: Request, { params }: Params) {
  ensureRunMonitor();
  const { runId } = await params;
  const run = getRunOr404(runId);
  if (run instanceof NextResponse) return run;

  const v = new URL(request.url).searchParams.get("v") ?? "0";
  const dir = findRunDir(runId);
  if (!dir) return NextResponse.json({ detail: "run directory not found" }, { status: 404 });

  const fname =
    v === "working"
      ? "working.html"
      : v === "custom"
        ? "draft-custom.html"
        : `draft-${/^\d+$/.test(v) ? v : "0"}.html`;
  let filePath = path.join(dir, fname);
  if (!fs.existsSync(filePath)) filePath = path.join(dir, "draft.html");
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ detail: "no draft" }, { status: 404 });
  }

  return new Response(fs.readFileSync(filePath, "utf-8"), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "sandbox allow-same-origin",
    },
  });
}
