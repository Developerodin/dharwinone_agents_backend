/** Port of backend/harness/guard.py */
import net from "node:net";

const BAD_ACCEPT = /\b(dev|watch|serve|start)\b/;
const ARG_RE = /^[A-Za-z0-9_./:\-]+$/;
const REQUIRED = ["id", "category", "title", "prompt", "accept", "allow_paths"] as const;
export const PROTECTED = ["backend/harness/", ".github/", "docs/superpowers/"];

export function lintAccept(cmd: string): boolean {
  return !BAD_ACCEPT.test(cmd);
}

export async function probeAsync(req: string): Promise<boolean> {
  const parts = req.split(":");
  const host = parts.length === 2 ? "127.0.0.1" : parts[1]!;
  const port = parts.length === 2 ? parts[1]! : parts[2]!;
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: parseInt(port, 10) }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.setTimeout(3000);
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
  });
}

export function pathViolations(changedPaths: string[], allowPaths: string[]): string[] {
  const bad: string[] = [];
  for (const raw of changedPaths) {
    const p = raw.replace(/\\/g, "/");
    if (PROTECTED.some((x) => p.startsWith(x)) || !allowPaths.some((a) => p.startsWith(a))) {
      bad.push(p);
    }
  }
  return bad;
}

function resolveChatAccept(
  task: Record<string, unknown>,
  cfg: Record<string, unknown>,
  violations: string[],
): void {
  if (typeof task.accept === "string") {
    violations.push("chat tasks must use accept_template, not string accept");
    return;
  }
  const tplName = task.accept_template as string | undefined;
  const templates = (cfg.accept_templates as Record<string, string[]>) ?? {};
  if (!tplName || !(tplName in templates)) {
    violations.push(`unknown accept_template: ${String(tplName)}`);
    return;
  }
  const args = (task.accept_args as string[]) ?? [];
  for (const arg of args) {
    if (typeof arg !== "string" || !ARG_RE.test(arg) || arg.includes("..")) {
      violations.push(`invalid accept_arg: ${String(arg)}`);
      return;
    }
  }
  const argv: string[] = [];
  for (const part of templates[tplName]!) {
    if (part === "{args}") argv.push(...args);
    else argv.push(part);
  }
  task.accept = argv;
}

export function guardSync(task: Record<string, unknown>, cfg: Record<string, unknown>, freeGb: number): string[] {
  const violations: string[] = [];
  if (task.source === "chat") resolveChatAccept(task, cfg, violations);
  for (const k of REQUIRED) {
    if (!task[k]) violations.push(`missing field: ${k}`);
  }
  if (
    task.source !== "chat" &&
    task.accept &&
    typeof task.accept === "string" &&
    !lintAccept(task.accept)
  ) {
    violations.push(`acceptance command looks interactive/watch-mode: ${task.accept}`);
  }
  const limits = cfg.limits as { min_disk_gb?: number } | undefined;
  if (freeGb < (limits?.min_disk_gb ?? 30)) violations.push(`low disk: ${freeGb}GB free`);
  return violations;
}

export async function guard(
  task: Record<string, unknown>,
  cfg: Record<string, unknown>,
  freeGb: number,
): Promise<string[]> {
  const violations = guardSync(task, cfg, freeGb);
  const requires = (task.requires as string[]) ?? [];
  for (const req of requires) {
    if (!(await probeAsync(req))) violations.push(`service unavailable: ${req}`);
  }
  return violations;
}
