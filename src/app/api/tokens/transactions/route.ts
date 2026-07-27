import { NextResponse } from "next/server";
import { requireUserId } from "@/server/builderRoute";
import * as tokenService from "@/server/services/tokenService";

export async function GET(request: Request) {
  const uid = requireUserId(request);
  if (uid instanceof NextResponse) return uid;
  return NextResponse.json({ transactions: await tokenService.listTransactions(uid) });
}
