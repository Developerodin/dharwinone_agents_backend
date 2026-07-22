/** Shell bridge — TS harness recover (Python fallback removed). */
import type { LegacyProject } from "./legacyProjects";
import * as legacyProjects from "./legacyProjects";
import { recover } from "./harness/gitops";

export function recoverHarness(project: LegacyProject, runId: string, taskId: string): void {
  const cfg = legacyProjects.deriveHarnessCfg(project, runId);
  recover(cfg, new Set([taskId]));
}
