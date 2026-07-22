import { NextResponse } from "next/server";
import * as paymentService from "@/server/services/paymentService";

export async function POST(request: Request) {
  const rawBody = await request.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ detail: "invalid JSON body" }, { status: 422 });
  }

  const signature =
    request.headers.get("x-razorpay-signature") ??
    request.headers.get("X-Razorpay-Signature") ??
    "";

  try {
    const result = await paymentService.handleRazorpayWebhook({ rawBody, signature, payload });
    return NextResponse.json(result);
  } catch (exc) {
    if (exc instanceof paymentService.PaymentError) {
      return NextResponse.json({ detail: exc.message }, { status: 400 });
    }
    throw exc;
  }
}
