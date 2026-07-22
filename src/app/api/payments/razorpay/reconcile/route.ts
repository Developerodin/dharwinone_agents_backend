import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import * as reconciliation from "@/server/services/paymentReconciliation";

/**
 * Ops-only reconciliation trigger (spec §10.2). Guarded by a shared admin secret via the
 * x-admin-secret header, compared with a constant-time check like the webhook signature.
 */
function authorized(request: Request): boolean {
  const secret = (process.env.RECONCILE_ADMIN_SECRET ?? "").trim();
  if (!secret) return false;
  const provided = (request.headers.get("x-admin-secret") ?? "").trim();
  if (!provided) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ detail: "forbidden" }, { status: 403 });
  }

  // Optional body { payments: [...] } lets ops reconcile a specific list; otherwise the
  // service pulls recently-captured payments from Razorpay (env-gated).
  let payments: reconciliation.ReconcilablePayment[] | undefined;
  try {
    const body = (await request.json()) as { payments?: reconciliation.ReconcilablePayment[] };
    payments = Array.isArray(body?.payments) ? body.payments : undefined;
  } catch {
    payments = undefined;
  }

  const result = await reconciliation.reconcileRazorpayPayments({ payments });
  return NextResponse.json(result);
}
