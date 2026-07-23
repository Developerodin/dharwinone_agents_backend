import { NextResponse } from "next/server";
import { userId } from "@/server/api";
import * as tokenService from "@/server/services/tokenService";

/** Charge an arbitrary cost (e.g. site editor: 5 tokens per change). Reserve+commit
 *  reuses the existing ledger; idempotencyKey from the client makes retries a no-op. */
export async function POST(request: Request) {
  const uid = userId(request);
  if (!uid) return NextResponse.json({ detail: "authentication required" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    cost?: number;
    idempotencyKey?: string;
    siteId?: string;
  };
  const cost = Math.max(0, Math.floor(Number(body.cost ?? 0)));
  if (cost === 0) {
    return NextResponse.json({ balance: await tokenService.getBalance(uid), charged: 0 });
  }

  try {
    const hold = await tokenService.reserveTokens({
      userId: uid,
      actionType: "site_edit",
      idempotencyKey: body.idempotencyKey ?? crypto.randomUUID(),
      siteId: body.siteId,
      costOverride: cost,
    });
    await tokenService.commitTokens(hold.transactionId);
    return NextResponse.json({ balance: await tokenService.getBalance(uid), charged: hold.cost });
  } catch (err) {
    if (err instanceof tokenService.InsufficientTokensError) {
      return NextResponse.json(
        { detail: "insufficient tokens", balance: err.balance },
        { status: 402 },
      );
    }
    throw err;
  }
}
