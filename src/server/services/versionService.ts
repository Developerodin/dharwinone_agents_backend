import * as editsRepo from "../repos/editsRepo";
import * as projectsRepo from "../repos/projectsRepo";
import * as versionsRepo from "../repos/versionsRepo";
import * as workingHtmlRepo from "../repos/workingHtmlRepo";

export class VersionError extends Error {}

export async function restore(
  projectId: string,
  versionId: string,
): Promise<Record<string, unknown>> {
  if (!(await projectsRepo.get(projectId))) throw new Error("project not found");
  const version = await versionsRepo.get(projectId, versionId);
  if (!version) throw new VersionError("version not found");
  const html = version.snapshotHtml;
  if (!html || typeof html !== "string") throw new VersionError("version snapshot missing");
  await workingHtmlRepo.put(projectId, html, null);
  const restored = await versionsRepo.create(projectId, {
    label: `Restored from ${versionId}`,
    trigger: "restore",
    html,
  });
  await projectsRepo.updateFields(projectId, {
    currentVersionId: restored.versionId,
    status: "editing",
  });
  await editsRepo.append(projectId, {
    source: "restore",
    userPrompt: "",
    actionSummary: `Restored version ${versionId}`,
    changeScope: "restore",
    targets: [versionId],
    versionId: restored.versionId as string,
  });
  return { restoredFrom: versionId, versionId: restored.versionId, html };
}

export async function listVersions(projectId: string): Promise<Record<string, unknown>[]> {
  if (!(await projectsRepo.get(projectId))) throw new Error("project not found");
  return versionsRepo.listForProject(projectId);
}
