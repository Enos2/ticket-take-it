// ==========================================
// FILE: backend/src/modules/resale/resale.service.ts
// PURPOSE: Ticket resale: organiser settings, listing a ticket, buying it, and moving it safely when the payment arrives.
// ==========================================
import { randomBytes } from "crypto";
import { EventStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";
import { getManagedEvent } from "../events/event.access";
import { commissionFor } from "../finance/ledger.service";
import { MAX_TRANSFERS_PER_TICKET } from "../transfers/transfers.service";
import { CreateListingInput, MarkPaidInput, ResaleSettingsInput } from "./resale.schema";

type Db = Prisma.TransactionClient;

// How long a buyer has to pay once they pick a listing.
export const RESALE_HOLD_MINUTES = 15;

// 128 bits of randomness, same as when a ticket is first issued.
const newTicketCode = () => randomBytes(16).toString("base64url");

const isLive = (event: { status: EventStatus; endsAt: Date }) =>
  (event.status === "PUBLISHED" || event.status === "SOLD_OUT") && event.endsAt > new Date();

// The highest price allowed: a share of what the ticket originally cost. M-Pesa only takes whole shillings.
export function maxResalePrice(faceValueCents: number, maxPercent: number, currency: string): number {
  const cap = Math.floor((faceValueCents * maxPercent) / 100);
  return currency === "KES" ? Math.floor(cap / 100) * 100 : cap;
}

// A reservation that ran out of time counts as free again, even before anything cleans it up.
const openListing = (now: Date): Prisma.ResaleListingWhereInput => ({
  OR: [{ status: "ACTIVE" }, { status: "RESERVED", reservedUntil: { lte: now } }],
});

// ---------------------------------------------------------------- organiser settings

export async function getSettings(userId: string, role: Role, eventId: string) {
  const event = await getManagedEvent(userId, role, eventId);

  const [open, sold] = await Promise.all([
    prisma.resaleListing.count({ where: { eventId, status: { in: ["ACTIVE", "RESERVED"] } } }),
    prisma.resaleListing.count({ where: { eventId, status: "SOLD" } }),
  ]);

  return { enabled: event.resaleEnabled, maxPercent: event.resaleMaxPercent, open, sold };
}

export async function updateSettings(userId: string, role: Role, eventId: string, input: ResaleSettingsInput) {
  const event = await getManagedEvent(userId, role, eventId);
  if (event.status === "CANCELLED" || event.status === "COMPLETED" || event.endsAt < new Date()) {
    throw ApiError.badRequest("Resale settings cannot be changed on an event that has ended or been cancelled");
  }

  await prisma.event.update({
    where: { id: eventId },
    data: { resaleEnabled: input.enabled, resaleMaxPercent: input.maxPercent },
  });

  return await getSettings(userId, role, eventId);
}

// ---------------------------------------------------------------- browsing

// What a buyer sees on the event page. Seller details are never included.
export async function listForEvent(eventId: string) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, status: { in: ["PUBLISHED", "SOLD_OUT"] } },
    select: { resaleEnabled: true, resaleMaxPercent: true, endsAt: true },
  });
  if (!event) throw ApiError.notFound("Event not found");

  const now = new Date();
  if (!event.resaleEnabled || event.endsAt <= now) return { enabled: false, listings: [] };

  const rows = await prisma.resaleListing.findMany({
    where: { eventId, ...openListing(now) },
    orderBy: [{ priceCents: "asc" }, { createdAt: "asc" }],
    take: 100,
    select: {
      id: true,
      priceCents: true,
      currency: true,
      faceValueCents: true,
      sellerId: true,
      ticket: {
        select: {
          status: true,
          userId: true,
          ticketType: { select: { name: true, tier: true } },
          seat: { select: { row: true, number: true, section: { select: { name: true } } } },
        },
      },
    },
  });

  // A ticket that was used, voided or moved to someone else is no longer for sale.
  const listings = rows
    .filter((row) => row.ticket.status === "VALID" && row.ticket.userId === row.sellerId)
    .map((row) => ({
      id: row.id,
      priceCents: row.priceCents,
      currency: row.currency,
      faceValueCents: row.faceValueCents,
      ticketType: row.ticket.ticketType,
      seat: row.ticket.seat,
    }));

  return { enabled: true, listings };
}

// ---------------------------------------------------------------- the seller's side

// My listings, and the tickets I could sell (with the highest price allowed for each).
export async function myResale(userId: string) {
  const now = new Date();

  const [listings, tickets] = await Promise.all([
    prisma.resaleListing.findMany({
      where: { sellerId: userId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        ticketId: true,
        priceCents: true,
        currency: true,
        status: true,
        reservedUntil: true,
        soldAt: true,
        feeCents: true,
        netCents: true,
        payoutStatus: true,
        payoutPhone: true,
        ticket: { select: { ticketType: { select: { name: true } }, event: { select: { title: true, slug: true } } } },
      },
    }),
    prisma.ticket.findMany({
      where: {
        userId,
        status: "VALID",
        transferCount: { lt: MAX_TRANSFERS_PER_TICKET },
        order: { isComp: false },
        event: { resaleEnabled: true, status: { in: ["PUBLISHED", "SOLD_OUT"] }, endsAt: { gt: now } },
      },
      select: {
        id: true,
        orderItem: { select: { unitPriceCents: true } },
        ticketType: { select: { currency: true } },
        event: { select: { resaleMaxPercent: true } },
      },
      take: 200,
    }),
  ]);

  const options = tickets
    .filter((t) => t.orderItem.unitPriceCents > 0)
    .map((t) => ({
      ticketId: t.id,
      faceValueCents: t.orderItem.unitPriceCents,
      maxPriceCents: maxResalePrice(t.orderItem.unitPriceCents, t.event.resaleMaxPercent, t.ticketType.currency),
      currency: t.ticketType.currency,
    }));

  return {
    listings: listings.map((l) => ({
      ...l,
      // A reservation that ran out of time is shown as open again.
      status: l.status === "RESERVED" && l.reservedUntil && l.reservedUntil <= now ? ("ACTIVE" as const) : l.status,
    })),
    options,
  };
}

export async function createListing(userId: string, input: CreateListingInput) {
  const now = new Date();

  const ticket = await prisma.ticket.findFirst({
    where: { id: input.ticketId, userId },
    select: {
      id: true,
      eventId: true,
      status: true,
      transferCount: true,
      orderItem: { select: { unitPriceCents: true } },
      order: { select: { isComp: true } },
      ticketType: { select: { currency: true } },
      event: { select: { status: true, endsAt: true, resaleEnabled: true, resaleMaxPercent: true } },
    },
  });
  // "Missing" and "not yours" look the same, so ticket ids can't be probed.
  if (!ticket) throw ApiError.notFound("Ticket not found");

  if (ticket.status === "USED") throw ApiError.badRequest("This ticket was already used");
  if (ticket.status !== "VALID") throw ApiError.badRequest("This ticket is no longer valid");
  if (!isLive(ticket.event)) throw ApiError.badRequest("Tickets for this event can no longer be resold");
  if (!ticket.event.resaleEnabled) throw ApiError.badRequest("The organiser has not allowed resale for this event");

  const faceValue = ticket.orderItem.unitPriceCents;
  if (ticket.order.isComp || faceValue <= 0) throw ApiError.badRequest("Free and complimentary tickets cannot be resold");
  if (ticket.transferCount >= MAX_TRANSFERS_PER_TICKET) {
    throw ApiError.badRequest(`This ticket already changed hands ${MAX_TRANSFERS_PER_TICKET} times, which is the most allowed`);
  }

  const currency = ticket.ticketType.currency;
  const cap = maxResalePrice(faceValue, ticket.event.resaleMaxPercent, currency);
  if (input.priceCents > cap) {
    throw ApiError.badRequest(`The highest price allowed for this ticket is ${cap / 100} ${currency}`);
  }
  if (currency === "KES" && input.priceCents % 100 !== 0) {
    throw ApiError.badRequest("KES prices must be whole shillings (a multiple of 100 cents)");
  }

  const waiting = await prisma.ticketTransfer.count({ where: { ticketId: ticket.id, status: "PENDING", expiresAt: { gt: now } } });
  if (waiting > 0) throw ApiError.badRequest("This ticket has a transfer waiting. Cancel the transfer first.");

  try {
    return await prisma.resaleListing.create({
      data: {
        ticketId: ticket.id,
        eventId: ticket.eventId,
        sellerId: userId,
        priceCents: input.priceCents,
        currency,
        faceValueCents: faceValue,
        payoutPhone: input.payoutPhone,
      },
      select: { id: true, ticketId: true, priceCents: true, currency: true, status: true },
    });
  } catch (err) {
    // The unique index allows only one open listing per ticket.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw ApiError.conflict("This ticket is already listed for resale");
    }
    throw err;
  }
}

export async function cancelListing(userId: string, listingId: string) {
  const cancelled = await prisma.resaleListing.updateMany({
    where: { id: listingId, sellerId: userId, ...openListing(new Date()) },
    data: { status: "CANCELLED" },
  });
  if (cancelled.count > 0) return;

  const listing = await prisma.resaleListing.findFirst({ where: { id: listingId, sellerId: userId }, select: { status: true } });
  if (!listing) throw ApiError.notFound("Listing not found");
  if (listing.status === "RESERVED") throw ApiError.conflict("A buyer is paying for this ticket right now. Try again in a few minutes.");
  if (listing.status === "SOLD") throw ApiError.conflict("This ticket was already sold");
  // Already cancelled: nothing to do.
}

// ---------------------------------------------------------------- the buyer's side

// Reserves a listing for the buyer and creates the order they pay for with the normal checkout.
export async function buyListing(buyerId: string, listingId: string) {
  const buyer = await prisma.user.findUnique({ where: { id: buyerId }, select: { emailVerified: true, isActive: true } });
  if (!buyer || !buyer.isActive) throw ApiError.unauthorized();
  if (!buyer.emailVerified) throw ApiError.forbidden("Verify your email address before buying tickets");

  const now = new Date();
  const until = new Date(now.getTime() + RESALE_HOLD_MINUTES * 60 * 1000);

  return await prisma.$transaction(async (tx) => {
    const listing = await tx.resaleListing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        sellerId: true,
        priceCents: true,
        currency: true,
        ticket: { select: { status: true, userId: true } },
        event: { select: { status: true, endsAt: true, resaleEnabled: true, seller: { select: { status: true } } } },
      },
    });
    if (!listing) throw ApiError.notFound("This listing is no longer available");

    if (listing.sellerId === buyerId) throw ApiError.badRequest("You cannot buy your own ticket");
    if (!isLive(listing.event) || !listing.event.resaleEnabled || listing.event.seller.status !== "APPROVED") {
      throw ApiError.badRequest("Tickets for this event cannot be bought right now");
    }
    if (listing.ticket.status !== "VALID" || listing.ticket.userId !== listing.sellerId) {
      throw ApiError.conflict("This ticket is no longer available");
    }

    // ONE conditional UPDATE: only one buyer can reserve the listing. A reservation that ran out of time is free again.
    const reserved = await tx.$executeRaw`
      UPDATE "ResaleListing"
      SET "status" = 'RESERVED', "buyerId" = ${buyerId}, "reservedUntil" = ${until}, "updatedAt" = ${now}
      WHERE "id" = ${listingId}
        AND ("status" = 'ACTIVE' OR ("status" = 'RESERVED' AND "reservedUntil" <= ${now}))`;
    if (reserved === 0) {
      throw ApiError.conflict("Someone else is buying this ticket right now. Try again in a few minutes, or pick another one.");
    }

    // No order lines: the organiser earns nothing from a resale, and no new ticket is created.
    const order = await tx.order.create({
      data: {
        reference: `RSL-${randomBytes(5).toString("hex").toUpperCase()}`,
        userId: buyerId,
        status: "PENDING",
        totalCents: listing.priceCents,
        currency: listing.currency,
        reservationExpiresAt: until,
        isResale: true,
      },
      select: { id: true, reference: true, status: true, totalCents: true, currency: true, reservationExpiresAt: true },
    });

    await tx.resaleListing.update({ where: { id: listingId }, data: { orderId: order.id } });
    return order;
  });
}

// ---------------------------------------------------------------- when the payment arrives

// Called by the payment settlement inside its transaction, once a resale order is paid.
// Moves the ticket to the buyer and replaces its QR code. Returns the listing id, or null when the sale
// cannot be completed (the listing was cancelled or re-reserved, or the ticket was used, voided or moved).
// A null makes the settlement flag the buyer's payment for a refund, so nobody pays for a ticket they do not get.
export async function completeResale(tx: Db, orderId: string): Promise<string | null> {
  const now = new Date();

  const listing = await tx.resaleListing.findFirst({
    where: { orderId, status: "RESERVED" },
    select: {
      id: true,
      ticketId: true,
      sellerId: true,
      priceCents: true,
      order: { select: { userId: true, totalCents: true } },
    },
  });
  if (!listing || !listing.order) return null;
  if (listing.order.totalCents !== listing.priceCents) return null;

  // The ticket must still belong to the seller and be unused. The new code means the seller's QR code stops working.
  const moved = await tx.ticket.updateMany({
    where: { id: listing.ticketId, userId: listing.sellerId, status: "VALID" },
    data: { userId: listing.order.userId, code: newTicketCode(), transferCount: { increment: 1 } },
  });
  if (moved.count === 0) return null;

  const fee = commissionFor(listing.priceCents, env.PLATFORM_FEE_BPS);

  await tx.resaleListing.update({
    where: { id: listing.id },
    data: {
      status: "SOLD",
      soldAt: now,
      buyerId: listing.order.userId,
      feeCents: fee,
      netCents: listing.priceCents - fee,
      payoutStatus: "OWED",
    },
  });

  // A transfer that was waiting for this ticket can no longer happen.
  await tx.ticketTransfer.updateMany({
    where: { ticketId: listing.ticketId, status: "PENDING" },
    data: { status: "CANCELLED", respondedAt: now },
  });

  return listing.id;
}

// ---------------------------------------------------------------- admin: paying the sellers

export async function listOwedProceeds() {
  return await prisma.resaleListing.findMany({
    where: { status: "SOLD", payoutStatus: "OWED" },
    orderBy: { soldAt: "asc" },
    take: 200,
    select: {
      id: true,
      soldAt: true,
      priceCents: true,
      feeCents: true,
      netCents: true,
      currency: true,
      payoutPhone: true,
      seller: { select: { fullName: true, email: true } },
      ticket: { select: { event: { select: { title: true } }, ticketType: { select: { name: true } } } },
    },
  });
}

export async function markProceedsPaid(adminId: string, listingId: string, input: MarkPaidInput) {
  const paid = await prisma.resaleListing.updateMany({
    where: { id: listingId, status: "SOLD", payoutStatus: "OWED" },
    data: { payoutStatus: "PAID", paidAt: new Date(), paidById: adminId, payoutReference: input.reference ?? null },
  });
  if (paid.count === 0) throw ApiError.notFound("No unpaid resale proceeds found for this listing");
}
// ==========================================
// END OF FILE: backend/src/modules/resale/resale.service.ts
// ==========================================