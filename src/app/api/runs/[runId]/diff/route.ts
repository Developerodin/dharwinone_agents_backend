import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { spawnSync } from "node:child_process";
import { diffText } from "@/server/gitops";
import * as legacyProjects from "@/server/legacyProjects";
import { ensureRunMonitor, getRunOr404 } from "@/server/runRoutes";
import { findRunDir } from "@/server/runs";

type Params = { params: Promise<{ runId: string }> };

export async function GET(_request: Request, { params }: Params) {
  ensureRunMonitor();
  const { runId } = await params;
  const run = getRunOr404(runId);
  if (run instanceof NextResponse) return run;

  const project = legacyProjects.get(run.project_id);
  if (!project) return NextResponse.json({ detail: "project not found" }, { status: 404 });
  const cfg = legacyProjects.deriveHarnessCfg(project, runId);
  const taskId = String(run.task.id);
  const wt = path.join(String(cfg.worktree_root), taskId);
  let text = "";
  if (fs.existsSync(wt) && fs.statSync(wt).isDirectory()) {
    text = diffText(wt, String(cfg.integration_branch));
  } else if (run.state === "shipped") {
    const r = spawnSync(
      "git",
      ["show", "--format=", String(cfg.integration_branch)],
      { cwd: String(cfg.repo_root), encoding: "utf-8" },
    );
    text = r.stdout ?? "";
  }
  return NextResponse.json({ text });
}
