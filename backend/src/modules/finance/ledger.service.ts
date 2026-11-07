// ==========================================
// FILE: backend/src/modules/finance/ledger.service.ts
// PURPOSE: Records every sale, commission and refund in the ledger, and repairs anything that was missed.
// ==========================================
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { env } from "../../config/env";

const DAY_MS = 24 * 60 * 60 * 1000;

// The seller's own rate if the admin set one, otherwise the platform default.
export const effectiveFeeBps = (sellerFeeBps: number | null | undefined): number => sellerFeeBps ?? env.PLATFORM_FEE_BPS;

export const commissionFor = (grossCents: number, feeBps: number): number => Math.round((grossCents * feeBps) / 10_000);

interface Share {
  gross: number;
  feeBps: number | null;
  endsAt: Date;
  titles: Set<string>;
}

// Posts a paid order to each seller's ledger: the sale, and the commission taken from it.
// Safe to call any number of times. The database ignores entries that already exist.
export async function postSaleEntries(orderId: string): Promise<number> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      reference: true,
      status: true,
      currency: true,
      items: {
        select: {
          subtotalCents: true,
          ticketType: {
            select: {
              event: { select: { title: true, endsAt: true, seller: { select: { id: true, feeBps: true } } } },
            },
          },
        },
      },
    },
  });
  if (!order || order.status !== "PAID") return 0;

  // One order can hold tickets from several sellers. Each seller gets their own share.
  const shares = new Map<string, Share>();
  for (const item of order.items) {
    const event = item.ticketType.event;
    const share: Share = shares.get(event.seller.id) ?? {
      gross: 0,
      feeBps: event.seller.feeBps,
      endsAt: event.endsAt,
      titles: new Set<string>(),
    };
    share.gross += item.subtotalCents;
    if (event.endsAt > share.endsAt) share.endsAt = event.endsAt;
    share.titles.add(event.title);
    shares.set(event.seller.id, share);
  }

  const rows: Prisma.LedgerEntryCreateManyInput[] = [];
  for (const [sellerId, share] of shares) {
    if (share.gross <= 0) continue; // free tickets earn nothing and cost nothing

    const bps = effectiveFeeBps(share.feeBps);
    const fee = commissionFor(share.gross, bps);
    const availableAt = new Date(share.endsAt.getTime() + env.PAYOUT_HOLD_DAYS * DAY_MS);
    const what = share.titles.size === 1 ? [...share.titles][0] : `${share.titles.size} events`;

    rows.push({
      sellerId,
      orderId,
      type: "SALE",
      amountCents: share.gross,
      currency: order.currency,
      availableAt,
      description: `Order ${order.reference}: ${what}`,
    });
    if (fee > 0) {
      rows.push({
        sellerId,
        orderId,
        type: "FEE",
        amountCents: -fee,
        currency: order.currency,
        feeBps: bps,
        availableAt,
        description: `Commission (${bps / 100}%) on order ${order.reference}`,
      });
    }
  }

  if (rows.length === 0) return 0;
  const result = await prisma.ledgerEntry.createMany({ data: rows, skipDuplicates: true });
  return result.count;
}

// Reverses a refunded order exactly. The reversal keeps the original availability date,
// so the order nets to zero whether its money was on hold or already available.
export async function postRefundEntries(orderId: string): Promise<number> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { reference: true, status: true } });
  if (!order || order.status !== "REFUNDED") return 0;

  const originals = await prisma.ledgerEntry.findMany({ where: { orderId, type: { in: ["SALE", "FEE"] } } });
  if (originals.length === 0) return 0;

  const rows = originals.map(
    (entry): Prisma.LedgerEntryCreateManyInput => ({
      sellerId: entry.sellerId,
      orderId,
      type: entry.type === "SALE" ? "REFUND" : "FEE_REFUND",
      amountCents: -entry.amountCents,
      currency: entry.currency,
      feeBps: entry.feeBps,
      availableAt: entry.availableAt,
      description: `Refund of order ${order.reference}`,
    })
  );

  const result = await prisma.ledgerEntry.createMany({ data: rows, skipDuplicates: true });
  return result.count;
}

// Runs every minute. Posts anything that was missed (a crash, an old order from before the ledger existed).
export async function reconcileLedger(): Promise<number> {
  let posted = 0;

  const unposted = await prisma.order.findMany({
    where: { status: "PAID", totalCents: { gt: 0 }, ledgerEntries: { none: { type: "SALE" } } },
    select: { id: true },
    orderBy: { paidAt: "asc" },
    take: 50,
  });
  for (const { id } of unposted) posted += await postSaleEntries(id);

  const unreversed = await prisma.order.findMany({
    where: { status: "REFUNDED", ledgerEntries: { some: { type: "SALE" }, none: { type: "REFUND" } } },
    select: { id: true },
    take: 50,
  });
  for (const { id } of unreversed) posted += await postRefundEntries(id);

  return posted;
}
// ==========================================
// END OF FILE: backend/src/modules/finance/ledger.service.ts
// ==========================================