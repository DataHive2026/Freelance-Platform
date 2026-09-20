import type { PaymentProviderAdapter } from "./provider";

/**
 * Used automatically when RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET aren't
 * set (see getProvider() in index.ts) — lets the funding flow be tested
 * end-to-end locally without a real Razorpay account. Every call is
 * console-logged so it's never ambiguous whether a "successful payment"
 * during development was real or mocked.
 */
export class MockPaymentProvider implements PaymentProviderAdapter {
  async createOrder(input: { amountInSmallestUnit: number; currency: string; receipt: string }) {
    console.warn(
      `[MockPaymentProvider] Creating a FAKE order for ${input.amountInSmallestUnit} ${input.currency} ` +
      `(receipt: ${input.receipt}). Set RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET to use the real provider.`
    );
    return { providerOrderId: `mock_order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
  }

  verifyPayment() {
    console.warn("[MockPaymentProvider] Auto-approving a FAKE payment — no real verification occurred.");
    return true;
  }
}
