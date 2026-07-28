import { NextResponse } from "next/server";
import * as sitesRepo from "@/server/repos/sitesRepo";
import { parseShareToken } from "@/server/services/siteShareService";

type Params = { params: Promise<{ token: string }> };

/**
 * Public site payload for a valid share token (no auth).
 * Used by the frontend launch-template share preview.
 */
export async function GET(_request: Request, { params }: Params) {
  const { token: raw } = await params;
  const siteId = parseShareToken(decodeURIComponent(raw));
  if (!siteId) {
    return NextResponse.json({ detail: "invalid share link" }, { status: 404 });
  }

  const site = await sitesRepo.get(siteId);
  if (!site) {
    return NextResponse.json({ detail: "site not found" }, { status: 404 });
  }

  return NextResponse.json({
    siteId: site.siteId,
    templateId: site.templateId ?? null,
    templateVersion: site.templateVersion ?? null,
    businessProfileJson: site.businessProfileJson ?? {},
    contentJson: site.contentJson ?? {},
    themeJson: site.themeJson ?? {},
    status: site.status ?? "draft",
    subdomain: site.subdomain ?? null,
    customDomain: site.customDomain ?? null,
    createdAt: site.createdAt ?? 0,
    updatedAt: site.updatedAt ?? 0,
  });
}
