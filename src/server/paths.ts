import path from "node:path";
import { backendDir, consentPath, dataDir, projectsPath, runDir, runsDir, statsPath } from "./config";

export { backendDir, consentPath, dataDir, projectsPath, runDir, runsDir, statsPath };

export function venvPy(): string {
  /** @deprecated Legacy Python studio only — Next.js runtime does not use this. */
  const win = path.join(backendDir(), ".venv", "Scripts", "python.exe");
  const unix = path.join(backendDir(), ".venv", "bin", "python");
  return process.platform === "win32" ? win : unix;
}

export function backendPath(relPath: string): string {
  if (path.isAbsolute(relPath)) return relPath;
  return path.normalize(path.join(backendDir(), relPath));
}
