import { NextResponse } from "next/server";
import { requireUserId } from "@/server/builderRoute";
import { revalidateTag } from "next/cache";
import { HttpError, httpErrorResponse } from "@/server/api";
import * as sitesRepo from "@/server/repos/sitesRepo";
import * as sitePublishService from "@/server/services/sitePublishService";

type Params = { params: Promise<{ siteId: string }> };

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
    const site = await requireOwnedSite(siteId, uid);
    return NextResponse.json({ checklist: sitePublishService.runPrePublishChecklist(site) });
  } catch (exc) {
    if (exc instanceof HttpError) return httpErrorResponse(exc);
    throw exc;
  }
}

export async function POST(request: Request, { params }: Params) {
  const uid = requireUserId(request);
  if (uid instanceof NextResponse) return uid;
  const { siteId } = await params;
  try {
    await requireOwnedSite(siteId, uid);
    const result = await sitePublishService.publishSite(siteId);
    revalidateTag(result.revalidateTag, "max");
    return NextResponse.json(result);
  } catch (exc) {
    if (exc instanceof HttpError) return httpErrorResponse(exc);
    if (exc instanceof Error && exc.message.startsWith("pre-publish")) {
      return NextResponse.json({ detail: exc.message }, { status: 400 });
    }
    throw exc;
  }
}
