import { NextResponse } from "next/server";
import { HttpError, httpErrorResponse, userId } from "@/server/api";
import * as sitesRepo from "@/server/repos/sitesRepo";

type Params = { params: Promise<{ siteId: string }> };

function requireUserId(request: Request): string | NextResponse {
  const uid = userId(request);
  if (!uid) return NextResponse.json({ detail: "authentication required" }, { status: 401 });
  return uid;
}

async function requireOwnedSite(siteId: string, uid: string) {
  const site = await sitesRepo.get(siteId);
  if (!site) throw new HttpError(404, "site not found");
  if (site.userId !== uid) throw new HttpError(403, "forbidden");
  return site;
}

export async function GET(request: Request, { params }: Params) {
  const uid = requireUserId(request);
  if (uid instanceof NextResponse) return uid;
  const { siteId } = await params;
  try {
    await requireOwnedSite(siteId, uid);
    return NextResponse.json(await sitesRepo.listVersions(siteId));
  } catch (exc) {
    if (exc instanceof HttpError) return httpErrorResponse(exc);
    throw exc;
  }
}
