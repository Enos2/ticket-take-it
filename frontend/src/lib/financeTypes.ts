// ==========================================
// FILE: frontend/src/lib/financeTypes.ts
// PURPOSE: Types for earnings, the ledger and payouts.
// ==========================================
import type { SellerStatus } from "./types";

export type LedgerType = "SALE" | "FEE" | "REFUND" | "FEE_REFUND" | "PAYOUT";
export type PayoutMethod = "MPESA" | "BANK" | "OTHER";

// One row per currency. Every amount is in cents.
export interface EarningsCurrency {
  currency: string;
  grossCents: number; // sales minus refunds
  feesCents: number; // commission taken
  paidOutCents: number;
  pendingCents: number; // earned, still on hold
  availableCents: number; // can be paid out now
}

export interface Earnings {
  currencies: EarningsCurrency[];
  feeBps: number; // this seller's commission in basis points, 500 = 5%
  defaultFeeBps: number;
  holdDays: number;
  payoutMethod: string | null;
  payoutDetails: string | null;
  payoutUpdatedAt: string | null;
}

export interface LedgerRow {
  id: string;
  type: LedgerType;
  amountCents: number; // negative when it takes money away
  currency: string;
  availableAt: string;
  createdAt: string;
  description: string | null;
  order: { reference: string } | null;
}

export interface PayoutRow {
  id: string;
  amountCents: number;
  currency: string;
  method: PayoutMethod;
  reference: string | null;
  note: string | null;
  createdAt: string;
  seller?: { businessName: string };
}

export interface BalanceSeller {
  id: string;
  businessName: string;
  businessEmail: string;
  status: SellerStatus;
  feeBps: number | null;
  payoutMethod: string | null;
  payoutDetails: string | null;
  payoutUpdatedAt: string | null;
  user: { email: string; fullName: string };
}

export interface BalanceRow {
  sellerId: string;
  currency: string;
  totalCents: number;
  availableCents: number;
  pendingCents: number;
  paidOutCents: number;
  seller: BalanceSeller | null;
}

export interface PlatformTotals {
  currency: string;
  grossCents: number; // all sales, after refunds
  commissionCents: number; // what the platform earned
  owedCents: number; // owed to sellers: on hold plus available
  paidOutCents: number;
}

export interface AdminBalances {
  rows: BalanceRow[];
  totals: PlatformTotals[];
  defaultFeeBps: number;
  holdDays: number;
}
// ==========================================
// END OF FILE: frontend/src/lib/financeTypes.ts
// ==========================================