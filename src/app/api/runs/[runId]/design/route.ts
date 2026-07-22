import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/server/api";
import * as legacyProjects from "@/server/legacyProjects";
import { JournalWriter } from "@/server/packets";
import {
  atomicWriteJson,
  ensureBuildEditing,
  ensureRunMonitor,
  getRunOr404,
  sanitizeHtml,
  workingPath,
} from "@/server/runRoutes";
import { findRunDir } from "@/server/runs";

const DesignChoice = z.object({
  id: z.string(),
  label: z.string(),
  variant: z.number(),
});

type Params = { params: Promise<{ runId: string }> };

export async function POST(request: Request, { params }: Params) {
  ensureRunMonitor();
  const { runId } = await params;
  const run = getRunOr404(runId);
  if (run instanceof NextResponse) return run;
  const editErr = ensureBuildEditing(run);
  if (editErr) return editErr;

  const project = legacyProjects.get(run.project_id);
  if (!project) return NextResponse.json({ detail: "project not found" }, { status: 404 });

  const { body, error } = await parseBody(request, DesignChoice);
  if (error) return error;

  const dir = findRunDir(runId);
  if (!dir) return NextResponse.json({ detail: "run directory not found" }, { status: 404 });
  const source = path.join(dir, `draft-${body.variant}.html`);
  if (!fs.existsSync(source)) {
    return NextResponse.json({ detail: "design variant not found" }, { status: 404 });
  }

  const html = sanitizeHtml(fs.readFileSync(source, "utf-8"));
  const wp = workingPath(runId);
  if (wp instanceof NextResponse) return wp;
  const [, working] = wp;
  fs.writeFileSync(working, html, "utf-8");
  atomicWriteJson(path.join(dir, "draft-choice.json"), {
    id: body.id,
    label: body.label,
    variant: body.variant,
  });
  run.task.selected_design = { id: body.id, label: body.label, variant: body.variant };
  atomicWriteJson(path.join(dir, "run.json"), run);
  const cfg = legacyProjects.deriveHarnessCfg(project, runId);
  const jw = new JournalWriter(String(cfg.journal_path), runId);
  jw.emit("design_selected", { id: body.id, label: body.label, variant: body.variant });
  jw.emit("edit_session_start", { template: body.id, label: body.label });
  return NextResponse.json({ html });
}
