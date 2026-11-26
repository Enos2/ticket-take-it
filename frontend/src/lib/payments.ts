// ==========================================
// FILE: frontend/src/lib/payments.ts
// PURPOSE: Types for card payments with Stripe, added on top of the payment types the checkout already uses.
// ==========================================
import type { InitializedPayment, PaymentMethods } from "./types";

// Stripe's hosted checkout page. The customer is sent there to pay, then comes back to /checkout/complete.
export interface InitializedStripe {
  provider: "STRIPE";
  checkoutUrl: string;
}

export type AnyInitializedPayment = InitializedPayment | InitializedStripe;

// The payment methods the server has switched on, now including card payments through Stripe.
export type AvailablePaymentMethods = PaymentMethods & { stripe: boolean };
// ==========================================
// END OF FILE: frontend/src/lib/payments.ts
// ==========================================