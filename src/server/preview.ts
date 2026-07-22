/** Port of backend/studio/preview.py */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import * as legacyProjects from "./legacyProjects";
import { killTag, trackPid } from "./runner";

const PREVIEW_TAG_PREFIX = "preview-";
const ACTIVE = new Map<string, PreviewInfo>();

export type PreviewInfo = {
  url: string;
  port: number;
  status: string;
  pid?: number;
  tag?: string;
};

async function findFreePort(project: legacyProjects.LegacyProject): Promise<number> {
  const range = (project.dev_port_range as number[] | undefined) ?? [4310, 4399];
  const [lo, hi] = range;
  for (let port = lo; port <= hi; port++) {
    const free = await new Promise<boolean>((resolve) => {
      const srv = net.createServer();
      srv.once("error", () => resolve(false));
      srv.once("listening", () => srv.close(() => resolve(true)));
      srv.listen(port, "127.0.0.1");
    });
    if (free) return port;
  }
  throw new Error("no free port in dev_port_range");
}

function worktreePath(project: legacyProjects.LegacyProject, runData: Record<string, unknown>): string {
  const cfg = legacyProjects.deriveHarnessCfg(project, String(runData.run_id));
  const wtRoot = String((runData as { worktree_root?: string }).worktree_root ?? cfg.worktree_root);
  const taskId = String((runData.task as { id: string }).id);
  return path.join(wtRoot, taskId);
}

async function waitReady(port: number, timeoutS = 60): Promise<boolean> {
  const deadline = Date.now() + timeoutS * 1000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) });
      if (res.status < 600) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

export async function start(runData: Record<string, unknown>): Promise<PreviewInfo> {
  const runId = String(runData.run_id);
  const existing = ACTIVE.get(runId);
  if (existing) return existing;

  const project = legacyProjects.get(String(runData.project_id));
  if (!project) throw new Error("project not found");
  const wt = worktreePath(project, runData);
  if (!fs.existsSync(wt)) throw new Error(`worktree not found: ${wt}`);

  const port = await findFreePort(project);
  const cmd = String(project.dev_cmd ?? "npm run dev");
  const proc = spawn(cmd, {
    cwd: wt,
    env: { ...process.env, PORT: String(port), CI: "true" },
    shell: true,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  proc.unref();
  const tag = `${PREVIEW_TAG_PREFIX}${runId}`;
  if (proc.pid) trackPid(tag, proc.pid);

  const readySec = parseFloat(process.env.STUDIO_PREVIEW_READY_SEC ?? "60");
  const ready = await waitReady(port, readySec);
  const info: PreviewInfo = {
    url: `http://127.0.0.1:${port}/`,
    port,
    status: ready ? "ready" : "starting",
    pid: proc.pid,
    tag,
  };
  ACTIVE.set(runId, info);
  return info;
}

export function getStatus(runId: string): PreviewInfo {
  return ACTIVE.get(runId) ?? { url: null as unknown as string, port: null as unknown as number, status: "stopped" };
}

export function stop(runId: string): PreviewInfo {
  const info = ACTIVE.get(runId);
  ACTIVE.delete(runId);
  if (info?.tag) killTag(info.tag);
  return { url: null as unknown as string, port: null as unknown as number, status: "stopped" };
}
