/** Razorpay webhook scaffold — env-gated token credit with idempotency. */
import { createHmac, timingSafeEqual } from "node:crypto";
import * as tokenRepo from "../repos/tokenTransactionsRepo";
import { getTokenPack } from "../config/tokenPacks";

export class PaymentError extends Error {}

function razorpayEnabled(): boolean {
  return (process.env.RAZORPAY_ENABLED ?? "").trim().toLowerCase() === "true";
}

function webhookSecret(): string {
  return (process.env.RAZORPAY_WEBHOOK_SECRET ?? "").trim();
}

export function verifyRazorpaySignature(body: string, signature: string): boolean {
  const secret = webhookSecret();
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function creditPurchase(input: {
  userId: string;
  packId: string;
  paymentId: string;
}): Promise<{ credited: boolean; tokens: number; transactionId?: string }> {
  const pack = getTokenPack(input.packId);
  if (!pack) throw new PaymentError("unknown token pack");

  const idempotencyKey = `razorpay:${input.paymentId}`;
  const existing = await tokenRepo.findByIdempotencyKey(idempotencyKey);
  if (existing) {
    return {
      credited: false,
      tokens: Number(existing.tokens ?? pack.tokens),
      transactionId: existing.transactionId,
    };
  }

  // Insert the ledger row first so the unique idempotency key is the race mutex: only the
  // winner reaches atomicCredit, so a concurrent retry can never double-credit.
  // ponytail: a crash in the (sub-millisecond) window between insert and credit would leave
  // the row without its credit; that residual gap is what reconciliation (§10.2) exists to
  // flag manually — the priority here is to never double-credit.
  let tx;
  try {
    tx = await tokenRepo.createCommittedCredit({
      userId: input.userId,
      actionType: "token_purchase",
      tokens: pack.tokens,
      idempotencyKey,
      packId: input.packId,
    });
  } catch (err) {
    if (tokenRepo.isUniqueViolation(err)) {
      const dup = await tokenRepo.findByIdempotencyKey(idempotencyKey);
      return {
        credited: false,
        tokens: Number(dup?.tokens ?? pack.tokens),
        transactionId: dup?.transactionId,
      };
    }
    throw err;
  }

  await tokenRepo.atomicCredit(input.userId, pack.tokens);
  return { credited: true, tokens: pack.tokens, transactionId: tx.transactionId };
}

export async function handleRazorpayWebhook(input: {
  rawBody: string;
  signature: string;
  payload: Record<string, unknown>;
}): Promise<{ status: "skipped" | "credited" | "ignored"; detail?: string; tokens?: number }> {
  if (!razorpayEnabled()) {
    return { status: "skipped", detail: "razorpay disabled" };
  }
  if (!verifyRazorpaySignature(input.rawBody, input.signature)) {
    throw new PaymentError("invalid webhook signature");
  }

  const event = String(input.payload.event ?? "");
  if (event !== "payment.captured") {
    return { status: "ignored", detail: event || "unknown event" };
  }

  const payment = (input.payload.payload as Record<string, unknown> | undefined)?.payment;
  const entity =
    (payment as Record<string, unknown> | undefined)?.entity ??
    (input.payload.payment as Record<string, unknown> | undefined);

  const paymentId = String((entity as Record<string, unknown> | undefined)?.id ?? "");
  const notes = ((entity as Record<string, unknown> | undefined)?.notes ?? {}) as Record<string, unknown>;
  const userId = String(notes.userId ?? notes.user_id ?? "");
  const packId = String(notes.packId ?? notes.pack_id ?? "starter");

  if (!paymentId || !userId) {
    return { status: "ignored", detail: "missing paymentId or userId in notes" };
  }

  const result = await creditPurchase({ userId, packId, paymentId });
  return {
    status: result.credited ? "credited" : "ignored",
    detail: result.credited ? undefined : "duplicate payment",
    tokens: result.tokens,
  };
}
