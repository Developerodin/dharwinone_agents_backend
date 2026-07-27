import { NextResponse } from "next/server";
import { requireUserId } from "@/server/builderRoute";
import { z } from "zod";
import { parseBody } from "@/server/api";
import * as sitesRepo from "@/server/repos/sitesRepo";

const ChatMessageSchema = z
  .object({
    id: z.string(),
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    timestamp: z.string(),
  })
  .passthrough();

const SiteCreateRequest = z.object({
  /** Optional client-stable id (e.g. web-agent local `site-…` uuid) to avoid duplicate drafts. */
  siteId: z.string().min(3).max(80).optional(),
  businessProfileJson: z.record(z.string(), z.unknown()).optional(),
  templateId: z.string().nullable().optional(),
  subdomain: z.string().nullable().optional(),
  chatHistoryJson: z.array(ChatMessageSchema).optional(),
});

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
