import path from "node:path";
import { backendDir, consentPath, dataDir, projectsPath, runDir, runsDir, statsPath } from "./config";

export { backendDir, consentPath, dataDir, projectsPath, runDir, runsDir, statsPath };

export function backendPath(relPath: string): string {
  if (path.isAbsolute(relPath)) return relPath;
  return path.normalize(path.join(backendDir(), relPath));
}
