import { NextResponse } from "next/server";
import * as sitePublishService from "@/server/services/sitePublishService";

type Params = { params: Promise<{ subdomain: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { subdomain } = await params;
  const snapshot = await sitePublishService.getPublishedSnapshot(subdomain);
  if (!snapshot) {
    return NextResponse.json({ detail: "published site not found" }, { status: 404 });
  }
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
