import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, httpErrorResponse, parseBody, userId } from "@/server/api";
import * as sitesRepo from "@/server/repos/sitesRepo";

type Params = { params: Promise<{ siteId: string }> };

const SiteUpdateRequest = z.object({
  templateId: z.string().nullable().optional(),
  templateVersion: z.string().nullable().optional(),
  businessProfileJson: z.record(z.string(), z.unknown()).optional(),
  contentJson: z.record(z.string(), z.unknown()).optional(),
  themeJson: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["draft", "published"]).optional(),
  subdomain: z.string().nullable().optional(),
  customDomain: z.string().nullable().optional(),
});

function requireUserId(request: Request): string | NextResponse {
  const uid = userId(request);
  if (!uid) return NextResponse.json({ detail: "authentication required" }, { status: 401 });
  return uid;
}

async function requireOwnedSite(siteId: string, uid: string): Promise<Record<string, unknown>> {
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
    return NextResponse.json(await requireOwnedSite(siteId, uid));
  } catch (exc) {
    if (exc instanceof HttpError) return httpErrorResponse(exc);
    throw exc;
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const uid = requireUserId(request);
  if (uid instanceof NextResponse) return uid;
  const { siteId } = await params;
  const { body, error } = await parseBody(request, SiteUpdateRequest);
  if (error) return error;
  try {
    await requireOwnedSite(siteId, uid);
    const updated = await sitesRepo.updateFields(siteId, body);
    return NextResponse.json(updated);
  } catch (exc) {
    if (exc instanceof HttpError) return httpErrorResponse(exc);
    throw exc;
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const uid = requireUserId(request);
  if (uid instanceof NextResponse) return uid;
  const { siteId } = await params;
  try {
    await requireOwnedSite(siteId, uid);
    const ok = await sitesRepo.remove(siteId);
    if (!ok) return NextResponse.json({ detail: "site not found" }, { status: 404 });
    return NextResponse.json({ status: "deleted" });
  } catch (exc) {
    if (exc instanceof HttpError) return httpErrorResponse(exc);
    throw exc;
  }
}
