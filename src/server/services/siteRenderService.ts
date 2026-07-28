import * as imageResolver from "./imageResolverService";
import * as sitesRepo from "../repos/sitesRepo";
import {
  familyFromTemplateId,
  sectionSchemaSections,
} from "@/app/sites/_render/utils";
import { buildImageMap } from "@/app/sites/_render/imageMap";
import type { RenderableSite } from "@/app/sites/_render/SiteRenderer";
import * as sitePublishService from "./sitePublishService";
import { resolveToBespokeTemplateId } from "../data/bespokeTemplateMapping";

export class RenderForbiddenError extends Error {
  constructor(message = "forbidden") {
    super(message);
    this.name = "RenderForbiddenError";
  }
}

function buildRenderableFromSite(site: Record<string, unknown>): RenderableSite {
  const profile = (site.businessProfileJson as Record<string, unknown> | undefined) ?? {};
  const templateId = resolveToBespokeTemplateId(
    site.templateId ? String(site.templateId) : null,
    profile,
  );
  const content = (site.contentJson as Record<string, unknown> | undefined) ?? {};
  const theme = (site.themeJson as Record<string, unknown> | undefined) ?? {};
  const packRefs = imageResolver.packRefsFromProfile(profile);
  const resolved = imageResolver.resolveSiteImages({
    content,
    theme,
    businessProfile: profile,
    packRefs,
  });

  return {
    templateId,
    family: familyFromTemplateId(templateId),
    contentJson: content,
    themeJson: theme,
    businessProfileJson: profile,
    sectionSchemaSections: sectionSchemaSections(templateId),
    resolvedImages: buildImageMap(resolved),
  };
}

export async function getDraftRenderable(
  siteId: string,
  userId: string,
): Promise<RenderableSite> {
  const site = await sitesRepo.get(siteId);
  if (!site) throw new Error("site not found");
  if (site.userId !== userId) throw new RenderForbiddenError();
  return buildRenderableFromSite(site);
}

/**
 * Render current draft for a valid public share token (no owner JWT).
 */
export async function getShareRenderable(siteId: string): Promise<RenderableSite> {
  const site = await sitesRepo.get(siteId);
  if (!site) throw new Error("site not found");
  return buildRenderableFromSite(site);
}

export async function getPublishedRenderable(
  subdomain: string,
): Promise<RenderableSite | null> {
  const snapshot = await sitePublishService.getPublishedSnapshot(subdomain);
  if (!snapshot) return null;

  const profile = (snapshot.businessProfileJson as Record<string, unknown>) ?? {};
  const templateId = resolveToBespokeTemplateId(
    snapshot.templateId ? String(snapshot.templateId) : null,
    profile,
  );
  const resolved = (snapshot.resolvedImages as imageResolver.ResolvedImage[] | undefined) ?? [];

  return {
    templateId,
    family: familyFromTemplateId(templateId),
    contentJson: (snapshot.contentJson as Record<string, unknown>) ?? {},
    themeJson: (snapshot.themeJson as Record<string, unknown>) ?? {},
    businessProfileJson: (snapshot.businessProfileJson as Record<string, unknown>) ?? {},
    sectionSchemaSections: sectionSchemaSections(templateId),
    resolvedImages: buildImageMap(resolved),
  };
}
