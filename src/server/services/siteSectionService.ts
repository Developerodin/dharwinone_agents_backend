/** Phase 1 site section AI mutations — regenerate / rewrite with snapshot + token hold. */
import * as contentAgentService from "./contentAgentService";
import * as sitesRepo from "../repos/sitesRepo";
import * as tokenService from "./tokenService";
import { HttpError } from "../api";

export async function mutateSection(input: {
  siteId: string;
  userId: string;
  sectionKey: string;
  actionType: "regenerate_section" | "ai_rewrite";
  idempotencyKey: string;
  instruction?: string;
}): Promise<{
  site: Record<string, unknown>;
  section: Record<string, unknown>;
  cost: number;
  snapshotVersionId: string;
}> {
  const site = await sitesRepo.get(input.siteId);
  if (!site) throw new HttpError(404, "site not found");
  if (site.userId !== input.userId) throw new HttpError(403, "forbidden");

  const content = (site.contentJson as Record<string, unknown> | undefined) ?? {};
  const currentSection = (content[input.sectionKey] as Record<string, unknown> | undefined) ?? {};
  if (!Object.keys(currentSection).length && input.actionType === "ai_rewrite") {
    throw new HttpError(400, "section has no content to rewrite");
  }

  const snapshot = await sitesRepo.createVersion(input.siteId, {
    contentJson: content,
    themeJson: (site.themeJson as Record<string, unknown> | undefined) ?? {},
    label: "pre-regen",
  });

  const profile = (site.businessProfileJson as Record<string, unknown> | undefined) ?? {};
  const section = await tokenService.withTokenHold({
    userId: input.userId,
    actionType: input.actionType,
    idempotencyKey: input.idempotencyKey,
    siteId: input.siteId,
    fn: () =>
      contentAgentService.regenerateSection({
        sectionKey: input.sectionKey,
        currentSection,
        instruction: input.instruction,
        businessProfile: profile,
      }),
  });

  const updated = await sitesRepo.updateFields(input.siteId, {
    contentJson: { ...content, [input.sectionKey]: section },
  });
  if (!updated) throw new HttpError(500, "failed to save section");

  return {
    site: updated,
    section,
    cost: tokenService.actionCost(input.actionType),
    snapshotVersionId: String(snapshot.versionId ?? ""),
  };
}
