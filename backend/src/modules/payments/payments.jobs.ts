// ==========================================
// FILE: backend/src/modules/payments/payments.jobs.ts
// PURPOSE: Background job that settles payments whose callback never arrived.
// ==========================================
import { logger } from "../../utils/logger";
import { reconcileMpesaPayments } from "./mpesa.service";

// Add each provider's reconcile function here. One failing provider never blocks the others.
export async function reconcilePayments(): Promise<number> {
  let changed = 0;

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