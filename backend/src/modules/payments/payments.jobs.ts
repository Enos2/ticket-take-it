// ==========================================
// FILE: backend/src/modules/payments/payments.jobs.ts
// PURPOSE: Background job that settles payments whose callback never arrived.
// ==========================================
import { logger } from "../../utils/logger";
import { reconcileMpesaPayments } from "./mpesa.service";
import { reconcilePaystackPayments } from "./paystack.service";
import { reconcileStripePayments } from "./stripe.service";

// One failing provider never blocks the others.
export async function reconcilePayments(): Promise<number> {
  let changed = 0;

  try {
    changed += await reconcilePaystackPayments();
  } catch (err) {
    logger.error({ err }, "Paystack reconciliation failed");
  }

  try {
    changed += await reconcileStripePayments();
  } catch (err) {
    logger.error({ err }, "Stripe reconciliation failed");
  }

  try {
    changed += await reconcileMpesaPayments();
  } catch (err) {
    logger.error({ err }, "M-Pesa reconciliation failed");
  }

  return changed;
}
// ==========================================
// END OF FILE: backend/src/modules/payments/payments.jobs.ts
// ==========================================