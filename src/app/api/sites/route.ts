import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, userId } from "@/server/api";
import * as sitesRepo from "@/server/repos/sitesRepo";

const SiteCreateRequest = z.object({
  businessProfileJson: z.record(z.string(), z.unknown()).optional(),
  templateId: z.string().nullable().optional(),
  subdomain: z.string().nullable().optional(),
});

function requireUserId(request: Request): string | NextResponse {
  const uid = userId(request);
  if (!uid) return NextResponse.json({ detail: "authentication required" }, { status: 401 });
  return uid;
}

export async function GET(request: Request) {
  const uid = requireUserId(request);
  if (uid instanceof NextResponse) return uid;
  return NextResponse.json(await sitesRepo.listForUser(uid));
}

export async function POST(request: Request) {
  const uid = requireUserId(request);
  if (uid instanceof NextResponse) return uid;
  const { body, error } = await parseBody(request, SiteCreateRequest);
  if (error) return error;
  const site = await sitesRepo.create(uid, body);
  return NextResponse.json(site, { status: 201 });
}
