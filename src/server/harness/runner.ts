/** Port of backend/harness/runner.py */
import { spawnSync } from "node:child_process";

const ACTIVE = new Map<string, Set<number>>();

export function trackPid(tag: string, pid: number): void {
  const set = ACTIVE.get(tag) ?? new Set<number>();
  set.add(pid);
  ACTIVE.set(tag, set);
}

export function killTag(tag: string): void {
  const pids = ACTIVE.get(tag);
  if (pids) {
    for (const pid of [...pids]) {
      spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], { encoding: "utf-8" });
    }
  }
  ACTIVE.delete(tag);
}

export function tail(text: string, lines: number): string {
  return text.split(/\r?\n/).slice(-lines).join("\n");
}

export function runCmd(
  cmd: string | string[],
  cwd: string,
  timeoutS: number,
  extraEnv: Record<string, string> = {},
  tag?: string,
): [number, string] {
  const isShell = typeof cmd === "string";
  const r = spawnSync(isShell ? cmd : cmd[0]!, isShell ? [] : cmd.slice(1), {
    cwd,
    shell: isShell,
    encoding: "utf-8",
    env: { ...process.env, CI: "true", ...extraEnv },
    timeout: timeoutS * 1000,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (tag && r.pid) trackPid(tag, r.pid);
  const out = (r.stdout || "") + (r.stderr || "");
  if (r.error?.name === "Error" && String(r.error).includes("ETIMEDOUT")) {
    return [124, `${out}\n[TIMEOUT: process tree killed]`];
  }
  return [r.status ?? 1, out];
}
