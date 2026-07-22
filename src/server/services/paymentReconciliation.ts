/**
 * Razorpay payment reconciliation (spec §10.2) — a safety net for missed webhooks.
 *
 * ponytail: pull-only and manual/scheduled-trigger. There is no cron framework here; call
 * reconcileRazorpayPayments() from a scheduler or the ops route. It re-uses the idempotent
 * creditPurchase path, so it is always safe to re-run and never double-credits.
 */
import * as creditService from "./paymentService";

export type ReconcilablePayment = {
  paymentId: string;
  userId: string;
  packId: string;
  status?: string;
};

export type ReconcileResult = {
  reconciled: number;
  skipped: number;
  results: { paymentId: string; credited: boolean; tokens?: number; detail?: string }[];
};

function razorpayEnabled(): boolean {
  return (process.env.RAZORPAY_ENABLED ?? "").trim().toLowerCase() === "true";
}

/**
 * Pull recently-captured payments from Razorpay. Env-gated like the webhook; returns [] when
 * disabled or unconfigured so reconciliation degrades to whatever the caller passed in.
 * ponytail: single page (no pagination), fixed window; ops can widen `count` if needed.
 */
async function fetchRecentCapturedPayments(): Promise<ReconcilablePayment[]> {
  if (!razorpayEnabled()) return [];
  const keyId = (process.env.RAZORPAY_KEY_ID ?? "").trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET ?? "").trim();
  if (!keyId || !keySecret) return [];

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/payments?count=100", {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { items?: Record<string, unknown>[] };
  const items = Array.isArray(body.items) ? body.items : [];
  return items
    .filter((it) => String(it.status ?? "") === "captured")
    .map((it) => {
      const notes = (it.notes ?? {}) as Record<string, unknown>;
      return {
        paymentId: String(it.id ?? ""),
        userId: String(notes.userId ?? notes.user_id ?? ""),
        packId: String(notes.packId ?? notes.pack_id ?? "starter"),
        status: "captured",
      };
    });
}

export async function reconcileRazorpayPayments(input?: {
  payments?: ReconcilablePayment[];
}): Promise<ReconcileResult> {
  const payments = input?.payments ?? (await fetchRecentCapturedPayments());
  const out: ReconcileResult = { reconciled: 0, skipped: 0, results: [] };

  for (const p of payments) {
    if (p.status && p.status !== "captured") {
      out.skipped++;
      out.results.push({ paymentId: p.paymentId, credited: false, detail: `status ${p.status}` });
      continue;
    }
    if (!p.paymentId || !p.userId) {
      out.skipped++;
      out.results.push({ paymentId: p.paymentId, credited: false, detail: "missing paymentId/userId" });
      continue;
    }
    // creditPurchase short-circuits on an existing razorpay:{paymentId} row, so re-running is idempotent.
    const res = await creditService.creditPurchase({
      userId: p.userId,
      packId: p.packId,
      paymentId: p.paymentId,
    });
    if (res.credited) out.reconciled++;
    else out.skipped++;
    out.results.push({ paymentId: p.paymentId, credited: res.credited, tokens: res.tokens });
  }

  return out;
}
