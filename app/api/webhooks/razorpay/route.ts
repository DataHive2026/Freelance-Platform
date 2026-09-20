import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { confirmFundingFromWebhook } from "@/lib/services/payments";

/**
 * Razorpay webhook authenticity check: HMAC-SHA256 of the RAW request
 * body (not the parsed JSON — whitespace/key-order differences would
 * break the signature) using RAZORPAY_WEBHOOK_SECRET, compared against
 * the X-Razorpay-Signature header. This is a DIFFERENT secret and a
 * DIFFERENT signature scheme than the order|payment HMAC used for
 * checkout completion in RazorpayAdapter.verifyPayment() — see the doc
 * comments on confirmFunding() vs confirmFundingFromWebhook() in
 * lib/services/payments/index.ts for why those two paths aren't merged.
 */
function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    // Deliberately vague response — don't tell a probing attacker
    // whether the secret or the payload was the problem.
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);

  if (event.event === "payment.captured") {
    const payment = event.payload?.payment?.entity;
    if (payment?.order_id && payment?.id) {
      try {
        await confirmFundingFromWebhook(payment.order_id, payment.id);
      } catch (err) {
        // Log and still 200 — Razorpay retries on non-2xx, and a
        // missing project_funding row (e.g. stale test event) isn't
        // something retrying will fix. Real monitoring belongs here
        // instead of a retry storm.
        console.error("[razorpay webhook] confirmFundingFromWebhook failed:", err);
      }
    }
  }

  // Other event types (payment.failed, order.paid, refund.*) are
  // intentionally unhandled for now — acknowledge receipt so Razorpay
  // doesn't retry, but there's no corresponding service logic yet.
  return NextResponse.json({ received: true });
}
