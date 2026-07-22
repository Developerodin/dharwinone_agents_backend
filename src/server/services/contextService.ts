import { sanitizeHtml } from "../draft";
import * as assetsRepo from "../repos/assetsRepo";
import * as conversationsRepo from "../repos/conversationsRepo";
import * as editsRepo from "../repos/editsRepo";
import * as projectsRepo from "../repos/projectsRepo";
import * as templatesRepo from "../repos/templatesRepo";
import * as versionsRepo from "../repos/versionsRepo";
import * as workingHtmlRepo from "../repos/workingHtmlRepo";
import * as profileService from "./profileService";
import * as onboardingService from "./onboardingService";

export async function getContext(projectId: string): Promise<Record<string, unknown>> {
  const project = await projectsRepo.get(projectId);
  if (!project) throw new Error("project not found");
  const profile = await profileService.getProfile(projectId);
  const working = await workingHtmlRepo.get(projectId);
  return {
    project,
    profile,
    chat: await onboardingService.getChat(projectId),
    assets: await assetsRepo.listForProject(projectId),
    templates: await templatesRepo.listForProject(projectId),
    workingHtml: working?.html ?? null,
    selectedTemplateId: working?.selectedTemplateId ?? null,
    versions: await versionsRepo.listForProject(projectId),
    edits: await editsRepo.listForProject(projectId),
  };
}

export function runQuality(html: string, profile?: Record<string, unknown> | null): Record<string, unknown> {
  const clean = sanitizeHtml(html ?? "");
  const issues: Array<Record<string, string>> = [];
  if (/\{\{[^}]+\}\}/.test(clean)) {
    issues.push({ level: "fail", code: "unresolved_placeholder", message: "Unresolved template tokens" });
  }
  if (profile) {
    const email = String(((profile.contact as Record<string, unknown> | undefined)?.email ?? "")).trim();
    if (email && !clean.includes(email)) {
      issues.push({ level: "warn", code: "contact_email_missing", message: "Contact email not visible" });
    }
  }
  if (/<script\b/i.test(clean)) {
    issues.push({ level: "fail", code: "script_tag", message: "Script tags present" });
  }
  if (/\son\w+\s*=/i.test(clean)) {
    issues.push({ level: "fail", code: "inline_handler", message: "Inline handlers present" });
  }
  if (!/<h1\b/i.test(clean)) {
    issues.push({ level: "warn", code: "missing_h1", message: "No primary heading" });
  }
  const fails = issues.filter((i) => i.level === "fail");
  const verdict = fails.length ? "fail" : issues.length ? "warn" : "pass";
  return { verdict, issues, score: Math.max(0, 100 - issues.length * 15) };
}
