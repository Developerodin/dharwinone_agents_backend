#!/usr/bin/env node
/** Next-only dev gate — replaces check_studio.py for TS workflow. */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function run(script) {
  const r = spawnSync(npmCmd, ["run", script], { cwd: root, stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log("check:next — vitest + build (Next-only gate)");
run("test");
run("build");
console.log("check:next OK");
