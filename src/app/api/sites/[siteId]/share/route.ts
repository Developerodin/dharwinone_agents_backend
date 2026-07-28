import { NextResponse } from "next/server";
import { HttpError, httpErrorResponse, userId } from "@/server/api";
import * as sitesRepo from "@/server/repos/sitesRepo";
import {
  appPublicBase,
  buildShareUrl,
} from "@/server/services/siteShareService";

type Params = { params: Promise<{ siteId: string }> };

/**
 * Create (or re-mint) a public draft share URL. No publish checklist.
 */
export async function POST(request: Request, { params }: Params) {
  const uid = userId(request);
  if (!uid) {
    return NextResponse.json({ detail: "authentication required" }, { status: 401 });
  }

  const { siteId } = await params;
  try {
    const site = await sitesRepo.get(siteId);
    if (!site) throw new HttpError(404, "site not found");
    if (site.userId !== uid) throw new HttpError(403, "forbidden");

    const shareUrl = buildShareUrl(siteId, appPublicBase(request));
    return NextResponse.json({
      shareUrl,
      siteId,
      subdomain: site.subdomain ?? null,
    });
  } catch (exc) {
    if (exc instanceof HttpError) return httpErrorResponse(exc);
    throw exc;
  }
}
