import { NextResponse } from "next/server";
import { userId } from "@/server/api";
import * as tokenService from "@/server/services/tokenService";

function requireUserId(request: Request): string | NextResponse {
  const uid = userId(request);
  if (!uid) return NextResponse.json({ detail: "authentication required" }, { status: 401 });
  return uid;
}

export async function GET(request: Request) {
  const uid = requireUserId(request);
  if (uid instanceof NextResponse) return uid;
  return NextResponse.json({ balance: await tokenService.getBalance(uid) });
}
