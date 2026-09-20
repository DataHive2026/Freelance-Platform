import crypto from "node:crypto";
import type { PaymentProviderAdapter } from "./provider";

/**
 * Talks to Razorpay's REST API directly rather than pulling in their
 * Node SDK — the API surface used here (create an order, verify a
 * webhook/checkout signature) is small enough that a dependency isn't
 * worth it, and it keeps this adapter's entire contract visible in one
 * file. If the integration grows (refunds, payout API, etc.), revisit.
 */
export class RazorpayAdapter implements PaymentProviderAdapter {
  private keyId: string;
  private keySecret: string;

  constructor() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set — see .env.example");
    }
    this.keyId = keyId;
    this.keySecret = keySecret;
  }

  async createOrder(input: { amountInSmallestUnit: number; currency: string; receipt: string }) {
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64");
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: input.amountInSmallestUnit,
        currency: input.currency,
        receipt: input.receipt,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Razorpay order creation failed: ${res.status} ${body}`);
    }

    const data = await res.json();
    return { providerOrderId: data.id as string };
  }

  verifyPayment(input: { providerOrderId: string; providerPaymentId: string; signature: string }): boolean {
    // Razorpay's documented verification: HMAC-SHA256 of
    // "order_id|payment_id" using the key secret, compared to the
    // signature the checkout widget / webhook payload provides.
    const expected = crypto
      .createHmac("sha256", this.keySecret)
      .update(`${input.providerOrderId}|${input.providerPaymentId}`)
      .digest("hex");

    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(input.signature));
    } catch {
      // Different-length buffers throw rather than returning false —
      // treat that as "not verified" rather than letting it propagate.
      return false;
    }
  }
}
