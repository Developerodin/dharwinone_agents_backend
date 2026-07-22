import * as profilesRepo from "../repos/profilesRepo";
import * as projectsRepo from "../repos/projectsRepo";
import * as templatesRepo from "../repos/templatesRepo";
import * as versionsRepo from "../repos/versionsRepo";
import * as workingHtmlRepo from "../repos/workingHtmlRepo";

export async function selectTemplate(
  projectId: string,
  templateId: string,
): Promise<Record<string, unknown>> {
  if (!(await projectsRepo.get(projectId))) throw new Error("project not found");
  const template = await templatesRepo.get(projectId, templateId);
  if (!template) throw new Error("template not found");
  const html = template.htmlContent;
  if (!html || typeof html !== "string") throw new Error("template html missing");
  await workingHtmlRepo.put(projectId, html, templateId);
  const profile = await profilesRepo.get(projectId);
  await versionsRepo.create(projectId, {
    label: `Selected ${template.label ?? templateId}`,
    trigger: "selection",
    html,
    profile,
  });
  const head = await versionsRepo.head(projectId);
  await projectsRepo.updateFields(projectId, {
    status: "editing",
    selectedTemplateId: templateId,
    currentVersionId: head?.versionId ?? null,
  });
  return { projectId, templateId, html };
}
