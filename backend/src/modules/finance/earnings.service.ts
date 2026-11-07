// ==========================================
// FILE: backend/src/modules/finance/earnings.service.ts
// PURPOSE: What a seller has earned, what is on hold, what can be withdrawn, and where it will be sent.
// ==========================================
import { LedgerType } from "@prisma/client";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";
import { background } from "../../utils/background";
import { verifyPassword } from "../../utils/password";
import { Pagination, skipTake } from "../../utils/pagination";
import { normalizeKenyanPhone } from "../payments/mpesa.service";
import { effectiveFeeBps } from "./ledger.service";
import { notifyPayoutDetailsChanged } from "./finance.notifications";

export interface CurrencyTotals {
  currency: string;
  grossCents: number; // sales minus refunds
  feesCents: number; // commission taken, after any returned on refunds
  paidOutCents: number;
  pendingCents: number; // earned, but still on hold
  availableCents: number; // can be paid out now
}

interface ByType {
  currency: string;
  type: LedgerType;
  _sum: { amountCents: number | null };
}

interface ByCurrency {
  currency: string;
  _sum: { amountCents: number | null };
}

// Turns raw ledger sums into one tidy row per currency.
export function summarize(byType: ByType[], availableRows: ByCurrency[]): CurrencyTotals[] {
  const map = new Map<string, CurrencyTotals & { total: number }>();
  const row = (currency: string) => {
    let existing = map.get(currency);
    if (!existing) {
      existing = { currency, grossCents: 0, feesCents: 0, paidOutCents: 0, pendingCents: 0, availableCents: 0, total: 0 };
      map.set(currency, existing);
    }
    return existing;
  };

  for (const r of byType) {
    const amount = r._sum.amountCents ?? 0;
    const target = row(r.currency);
    target.total += amount;
    if (r.type === "SALE" || r.type === "REFUND") target.grossCents += amount;
    else if (r.type === "FEE" || r.type === "FEE_REFUND") target.feesCents -= amount;
    else if (r.type === "PAYOUT") target.paidOutCents -= amount;
  }
  for (const r of availableRows) row(r.currency).availableCents = r._sum.amountCents ?? 0;

  return [...map.values()]
    .map(({ total, ...rest }) => ({ ...rest, pendingCents: total - rest.availableCents }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

async function requireSeller(userId: string) {
  const seller = await prisma.sellerProfile.findUnique({
    where: { userId },
    select: { id: true, feeBps: true, payoutMethod: true, payoutDetails: true, payoutUpdatedAt: true },
  });
  if (!seller) throw ApiError.forbidden("Seller profile not found");
  return seller;
}

export async function getEarnings(userId: string) {
  const seller = await requireSeller(userId);
  const now = new Date();

  const [byType, available] = await Promise.all([
    prisma.ledgerEntry.groupBy({ by: ["currency", "type"], where: { sellerId: seller.id }, _sum: { amountCents: true } }),
    prisma.ledgerEntry.groupBy({
      by: ["currency"],
      where: { sellerId: seller.id, availableAt: { lte: now } },
      _sum: { amountCents: true },
    }),
  ]);

  return {
    currencies: summarize(byType, available),
    feeBps: effectiveFeeBps(seller.feeBps),
    defaultFeeBps: env.PLATFORM_FEE_BPS,
    holdDays: env.PAYOUT_HOLD_DAYS,
    payoutMethod: seller.payoutMethod,
    payoutDetails: seller.payoutDetails,
    payoutUpdatedAt: seller.payoutUpdatedAt,
  };
}

export async function getLedger(userId: string, pagination: Pagination, type?: LedgerType) {
  const seller = await requireSeller(userId);
  const where = { sellerId: seller.id, ...(type && { type }) };

  const [items, total] = await prisma.$transaction([
    prisma.ledgerEntry.findMany({
      where,
      select: {
        id: true,
        type: true,
        amountCents: true,
        currency: true,
        availableAt: true,
        createdAt: true,
        description: true,
        order: { select: { reference: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...skipTake(pagination),
    }),
    prisma.ledgerEntry.count({ where }),
  ]);

  return { items, total, page: pagination.page, limit: pagination.limit };
}

export async function getSellerPayouts(userId: string, pagination: Pagination) {
  const seller = await requireSeller(userId);
  const where = { sellerId: seller.id };

  const [items, total] = await prisma.$transaction([
    prisma.payout.findMany({
      where,
      select: { id: true, amountCents: true, currency: true, method: true, reference: true, note: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      ...skipTake(pagination),
    }),
    prisma.payout.count({ where }),
  ]);

  return { items, total, page: pagination.page, limit: pagination.limit };
}

// Changing where the money goes needs the account password. If a login is ever stolen, the thief can't redirect payouts.
export async function setPayoutDetails(
  userId: string,
  input: { method: "MPESA" | "BANK"; details: string; password: string }
) {
  const seller = await requireSeller(userId);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw ApiError.badRequest("Your password is incorrect");
  }

  let stored = input.details.trim();
  if (input.method === "MPESA") {
    const phone = normalizeKenyanPhone(stored);
    if (!phone) throw ApiError.badRequest("Enter a valid Safaricom number, for example 0712345678");
    stored = phone;
  } else if (stored.length < 5) {
    throw ApiError.badRequest("Enter your bank name, account name and account number");
  }

  const updated = await prisma.sellerProfile.update({
    where: { id: seller.id },
    data: { payoutMethod: input.method, payoutDetails: stored, payoutUpdatedAt: new Date() },
    select: { payoutMethod: true, payoutDetails: true, payoutUpdatedAt: true },
  });

  background(notifyPayoutDetailsChanged(seller.id), "payout details email");
  return updated;
}
// ==========================================
// END OF FILE: backend/src/modules/finance/earnings.service.ts
// ==========================================