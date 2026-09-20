/**
 * Every payment provider (Razorpay now, Stripe later per Section 27)
 * implements this interface. PaymentService only ever talks to this
 * interface — never a provider SDK directly — so adding Stripe later
 * means writing a StripeAdapter and changing one factory function
 * (getProvider() in index.ts), not touching PaymentService itself.
 */
export interface PaymentProviderAdapter {
  createOrder(input: {
    amountInSmallestUnit: number; // paise for INR, cents for USD, etc.
    currency: string;
    receipt: string;
  }): Promise<{ providerOrderId: string }>;

  /**
   * Verifies a completed payment actually came from the provider and
   * matches the order it claims to. Returns false — never throws — on
   * any verification failure, so callers can treat "not verified" as an
   * ordinary outcome to handle, not an exceptional one.
   */
  verifyPayment(input: {
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  }): boolean;
}
