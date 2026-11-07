// ==========================================
// FILE: backend/src/modules/finance/payout.service.ts
// PURPOSE: Admin side of the money model: seller balances, recording payouts and setting commission rates.
// ==========================================
import { PayoutMethod, Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";
import { background } from "../../utils/background";
import { logger } from "../../utils/logger";
import { Pagination, skipTake } from "../../utils/pagination";
import { notifyPayout } from "./finance.notifications";

const key = (sellerId: string, currency: string) => `${sellerId}|${currency}`;
const entry = (sellerId: string, currency: string, value: number | null): [string, number] => [key(sellerId, currency), value ?? 0];

// Every seller who has money in the ledger, with what is on hold, what can be paid now, and what was already paid.
export async function listSellerBalances(pagination: Pagination, onlyDue: boolean) {
  const now = new Date();

  const [totals, available, paidOut, byType] = await Promise.all([
    prisma.ledgerEntry.groupBy({ by: ["sellerId", "currency"], _sum: { amountCents: true } }),
    prisma.ledgerEntry.groupBy({ by: ["sellerId", "currency"], where: { availableAt: { lte: now } }, _sum: { amountCents: true } }),
    prisma.ledgerEntry.groupBy({ by: ["sellerId", "currency"], where: { type: "PAYOUT" }, _sum: { amountCents: true } }),
    prisma.ledgerEntry.groupBy({ by: ["currency", "type"], _sum: { amountCents: true } }),
  ]);

  const availableMap = new Map(available.map((r) => entry(r.sellerId, r.currency, r._sum.amountCents)));
  const paidMap = new Map(paidOut.map((r) => entry(r.sellerId, r.currency, r._sum.amountCents)));

  let rows = totals.map((r) => {
    const total = r._sum.amountCents ?? 0;
    const availableCents = availableMap.get(key(r.sellerId, r.currency)) ?? 0;
    return {
      sellerId: r.sellerId,
      currency: r.currency,
      totalCents: total,
      availableCents,
      pendingCents: total - availableCents,
      paidOutCents: -(paidMap.get(key(r.sellerId, r.currency)) ?? 0),
    };
  });

  if (onlyDue) rows = rows.filter((r) => r.availableCents > 0);
  rows.sort((a, b) => b.availableCents - a.availableCents || a.sellerId.localeCompare(b.sellerId));

  const count = rows.length;
  const pageRows = rows.slice((pagination.page - 1) * pagination.limit, pagination.page * pagination.limit);

  const sellers = await prisma.sellerProfile.findMany({
    where: { id: { in: [...new Set(pageRows.map((r) => r.sellerId))] } },
    select: {
      id: true,
      businessName: true,
      businessEmail: true,
      status: true,
      feeBps: true,
      payoutMethod: true,
      payoutDetails: true,
      payoutUpdatedAt: true,
      user: { select: { email: true, fullName: true } },
    },
  });
  const sellerById = new Map(sellers.map((s) => [s.id, s]));

  // Platform-wide numbers, one row per currency.
  const platform = new Map<string, { currency: string; grossCents: number; commissionCents: number; owedCents: number; paidOutCents: number }>();
  for (const r of byType) {
    const amount = r._sum.amountCents ?? 0;
    const row = platform.get(r.currency) ?? { currency: r.currency, grossCents: 0, commissionCents: 0, owedCents: 0, paidOutCents: 0 };
    row.owedCents += amount;
    if (r.type === "SALE" || r.type === "REFUND") row.grossCents += amount;
    else if (r.type === "FEE" || r.type === "FEE_REFUND") row.commissionCents -= amount;
    else if (r.type === "PAYOUT") row.paidOutCents -= amount;
    platform.set(r.currency, row);
  }

  return {
    rows: pageRows.map((r) => ({ ...r, seller: sellerById.get(r.sellerId) ?? null })),
    totals: [...platform.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    defaultFeeBps: env.PLATFORM_FEE_BPS,
    holdDays: env.PAYOUT_HOLD_DAYS,
    total: count,
    page: pagination.page,
    limit: pagination.limit,
  };
}

interface PayoutInput {
  sellerId: string;
  currency: string;
  amountCents?: number; // leave out to pay everything that is available
  method: PayoutMethod;
  reference?: string;
  note?: string;
}

// Records a payout AFTER the money has been sent. It can never be more than what is available.
export async function recordPayout(adminId: string, input: PayoutInput) {
  const payout = await prisma.$transaction(async (tx) => {
    // Locks this seller's row until the transaction ends, so two admins can't pay the same money at once.
    await tx.$queryRaw`SELECT "id" FROM "SellerProfile" WHERE "id" = ${input.sellerId} FOR UPDATE`;

    const seller = await tx.sellerProfile.findUnique({ where: { id: input.sellerId }, select: { id: true, status: true } });
    if (!seller) throw ApiError.notFound("Seller not found");
    if (seller.status !== "APPROVED") {
      throw ApiError.badRequest("Payouts are paused for this seller because the account is not active");
    }

    const now = new Date();
    const sum = await tx.ledgerEntry.aggregate({
      where: { sellerId: seller.id, currency: input.currency, availableAt: { lte: now } },
      _sum: { amountCents: true },
    });
    const availableCents = sum._sum.amountCents ?? 0;
    const amountCents = input.amountCents ?? availableCents;

    if (amountCents <= 0) throw ApiError.badRequest("Nothing is available to pay out");
    if (amountCents > availableCents) {
      throw ApiError.badRequest(`Only ${(availableCents / 100).toFixed(2)} ${input.currency} is available to pay out`);
    }

    const created = await tx.payout.create({
      data: {
        sellerId: seller.id,
        amountCents,
        currency: input.currency,
        method: input.method,
        reference: input.reference || null,
        note: input.note || null,
        paidById: adminId,
      },
    });

    await tx.ledgerEntry.create({
      data: {
        sellerId: seller.id,
        payoutId: created.id,
        type: "PAYOUT",
        amountCents: -amountCents,
        currency: input.currency,
        availableAt: now,
        description: `Payout by ${input.method}${input.reference ? ` (${input.reference})` : ""}`,
        createdById: adminId,
      },
    });

    return created;
  });

  logger.info(`Payout ${payout.id} of ${payout.amountCents} ${payout.currency} recorded by admin ${adminId}`);
  background(notifyPayout(payout.id), "payout email");
  return payout;
}

export async function listPayouts(pagination: Pagination, sellerId?: string) {
  const where: Prisma.PayoutWhereInput = sellerId ? { sellerId } : {};

  const [items, total] = await prisma.$transaction([
    prisma.payout.findMany({
      where,
      include: { seller: { select: { businessName: true } } },
      orderBy: { createdAt: "desc" },
      ...skipTake(pagination),
    }),
    prisma.payout.count({ where }),
  ]);

  return { items, total, page: pagination.page, limit: pagination.limit };
}

// A rate for one seller, in basis points (500 = 5%). null puts them back on the platform default.
// It only applies to sales made after the change. Existing ledger entries are never rewritten.
export async function setSellerFee(sellerId: string, feeBps: number | null) {
  const seller = await prisma.sellerProfile.findUnique({ where: { id: sellerId }, select: { id: true } });
  if (!seller) throw ApiError.notFound("Seller not found");

  return await prisma.sellerProfile.update({
    where: { id: sellerId },
    data: { feeBps },
    select: { id: true, businessName: true, feeBps: true },
  });
}
// ==========================================
// END OF FILE: backend/src/modules/finance/payout.service.ts
// ==========================================