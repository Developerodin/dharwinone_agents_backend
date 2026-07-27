import { NextResponse } from "next/server";
import { requireUserId } from "@/server/builderRoute";
import { HttpError, httpErrorResponse } from "@/server/api";
import * as siteAssetService from "@/server/services/siteAssetService";

type Params = { params: Promise<{ siteId: string }> };

export async function GET(request: Request, { params }: Params) {
  const uid = requireUserId(request);
  if (uid instanceof NextResponse) return uid;
  const { siteId } = await params;
  try {
    return NextResponse.json(await siteAssetService.listAssets(siteId, uid));
  } catch (exc) {
    if (exc instanceof siteAssetService.SiteAssetValidationError) {
      const status = exc.message === "forbidden" ? 403 : exc.message === "site not found" ? 404 : 422;
      return NextResponse.json({ detail: exc.message }, { status });
    }
    if (exc instanceof HttpError) return httpErrorResponse(exc);
    throw exc;
  }
}
