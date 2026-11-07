// ==========================================
// FILE: frontend/src/lib/finance.ts
// PURPOSE: Labels and helpers for earnings and payouts.
// ==========================================
import { formatMoney } from "./format";
import type { Tone } from "./orders";
import type { LedgerType, PayoutMethod } from "./financeTypes";

export const LEDGER_LABEL: Record<LedgerType, string> = {
  SALE: "Sale",
  FEE: "Commission",
  REFUND: "Refund",
  FEE_REFUND: "Commission returned",
  PAYOUT: "Payout",
};

export const LEDGER_TONE: Record<LedgerType, Tone> = {
  SALE: "ok",
  FEE: "neutral",
  REFUND: "brand",
  FEE_REFUND: "neutral",
  PAYOUT: "gold",
};

export const METHOD_LABEL: Record<PayoutMethod, string> = {
  MPESA: "M-Pesa",
  BANK: "Bank transfer",
  OTHER: "Other",
};

// 500 becomes "5%", 750 becomes "7.5%".
export const bpsText = (bps: number): string => `${bps / 100}%`;

// formatMoney shows zero as "Free", which is wrong for a balance.
export const money = (cents: number, currency: string): string => (cents === 0 ? `${currency} 0` : formatMoney(cents, currency));

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const changedRecently = (iso: string | null): boolean => iso !== null && Date.now() - new Date(iso).getTime() < WEEK_MS;
// ==========================================
// END OF FILE: frontend/src/lib/finance.ts
// ==========================================