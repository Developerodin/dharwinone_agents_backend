import { NextResponse } from "next/server";
import { requireUserId } from "@/server/builderRoute";
import { z } from "zod";
import { HttpError, httpErrorResponse, parseBody } from "@/server/api";
import * as sitesRepo from "@/server/repos/sitesRepo";

type Params = { params: Promise<{ siteId: string }> };

const RestoreRequest = z.object({
  versionId: z.string().min(4),
});

async function requireOwnedSite(siteId: string, uid: string) {
  const site = await sitesRepo.get(siteId);
  if (!site) throw new HttpError(404, "site not found");
  if (site.userId !== uid) throw new HttpError(403, "forbidden");
  return site;
}

export async function POST(request: Request, { params }: Params) {
  const uid = requireUserId(request);
  if (uid instanceof NextResponse) return uid;
  const { siteId } = await params;
  const { body, error } = await parseBody(request, RestoreRequest);
  if (error) return error;

  try {
    await requireOwnedSite(siteId, uid);
    const result = await sitesRepo.restoreVersion(siteId, body.versionId);
    return NextResponse.json(result);
  } catch (exc) {
    if (exc instanceof HttpError) return httpErrorResponse(exc);
    if (exc instanceof Error && exc.message === "version not found") {
      return NextResponse.json({ detail: exc.message }, { status: 404 });
    }
    throw exc;
  }
}
