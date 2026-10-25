// ==========================================
// FILE: frontend/src/lib/admin.ts
// PURPOSE: Labels and helpers for the admin area.
// ==========================================
import { formatMoney } from "./format";
import type { Tone } from "./orders";
import type { PaymentProviderName } from "./adminTypes";
import type { Role, SellerStatus } from "./types";

export const ROLE_LABEL: Record<Role, string> = {
  USER: "Buyer",
  SELLER: "Seller",
  ADMIN: "Admin",
};

export function sellerStatusTone(status: SellerStatus): Tone {
  switch (status) {
    case "APPROVED":
      return "ok";
    case "PENDING":
      return "gold";
    case "REJECTED":
    case "SUSPENDED":
      return "brand";
  }
}

export const PROVIDER_LABEL: Record<PaymentProviderName, string> = {
  PAYSTACK: "Paystack",
  MPESA: "M-Pesa",
  STRIPE: "Stripe",
  MANUAL: "Test payment",
};

const REFUND_REASONS: Record<string, string> = {
  order_refunded: "Order refunded",
  order_already_settled: "Charged twice",
  stock_unavailable_after_expiry: "Paid after the tickets sold out",
  amount_mismatch: "Paid the wrong amount",
};

export function refundReason(metadata: Record<string, unknown> | null): string {
  const reason = metadata?.reason;
  return typeof reason === "string" && REFUND_REASONS[reason] ? REFUND_REASONS[reason] : "Needs a refund";
}

export function metaText(metadata: Record<string, unknown> | null, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export function metaNumber(metadata: Record<string, unknown> | null, key: string): number | null {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// What an admin has to do for payments that are not refunded automatically.
export function refundHowTo(provider: PaymentProviderName): string {
  switch (provider) {
    case "MPESA":
      return "Return the money through M-Pesa (a reversal, or send it back to the customer's number), then mark it as returned and note the M-Pesa receipt.";
    case "PAYSTACK":
      return "Retry the automatic refund. If it keeps failing, check your Paystack balance and dashboard. Refund it there by hand, then mark it as returned.";
    default:
      return "Return the money by hand, then mark it as returned.";
  }
}

// Zero would read as "Free" elsewhere, which is wrong for money taken in.
export const revenueText = (cents: number, currency: string): string =>
  cents === 0 ? `${currency} 0` : formatMoney(cents, currency);
// ==========================================
// END OF FILE: frontend/src/lib/admin.ts
// ==========================================