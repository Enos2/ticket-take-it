// ==========================================
// FILE: backend/src/modules/sellers/sellers.service.ts
// PURPOSE: Seller logic: onboarding, orders, events dashboard and attendees.
// ==========================================
import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { skipTake } from "../../utils/pagination";
import { getManagedEvent } from "../events/event.access";
import {
  OnboardSellerInput,
  SellerOrdersQuery,
  SellerEventsQuery,
  AttendeesQuery,
} from "./sellers.schema";

export async function onboardSeller(userId: string, input: OnboardSellerInput) {
  const existing = await prisma.sellerProfile.findUnique({ where: { userId } });
  if (existing) throw ApiError.conflict("Seller profile already exists");

  try {
    return await prisma.$transaction(async (tx) => {
      const profile = await tx.sellerProfile.create({
        data: {
          userId,
          businessName: input.businessName,
          businessEmail: input.businessEmail,
          businessPhone: input.businessPhone,
          status: "PENDING", // an admin must approve before they can publish anything
        },
      });

      // Only promote plain users. Never downgrade an ADMIN.
      await tx.user.updateMany({
        where: { id: userId, role: "USER" },
        data: { role: "SELLER" },
      });

      return profile;
    });
  } catch (err) {
    // Two onboarding requests at the same moment: the unique index on userId catches the loser.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw ApiError.conflict("Seller profile already exists");
    }
    throw err;
  }
}

export async function getSellerProfile(userId: string) {
  const profile = await prisma.sellerProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      businessName: true,
      businessEmail: true,
      businessPhone: true,
      status: true,
      approvedAt: true,
      createdAt: true,
    },
  });
  if (!profile) throw ApiError.notFound("Seller profile not found");
  return profile;
}

export async function getSellerOrders(userId: string, role: Role, query: SellerOrdersQuery) {
  const { page, limit, status } = query;

  let where: Prisma.OrderItemWhereInput = {};

  if (role !== "ADMIN") {
    const seller = await prisma.sellerProfile.findUnique({ where: { userId } });
    if (!seller) throw ApiError.forbidden("Seller profile not found");
    where = { ticketType: { event: { sellerId: seller.id } } };
  }

  if (status) where = { ...where, order: { status } };

  const [items, total] = await prisma.$transaction([
    prisma.orderItem.findMany({
      where,
      include: {
        order: { select: { reference: true, status: true, createdAt: true, paidAt: true } },
        ticketType: {
          select: { name: true, currency: true, event: { select: { title: true, slug: true } } },
        },
      },
      orderBy: { order: { createdAt: "desc" } },
      ...skipTake(query),
    }),
    prisma.orderItem.count({ where }),
  ]);

  return { items, total, page, limit };
}

// All of the seller's own events, drafts included, with ticket stock.
export async function getSellerEvents(userId: string, query: SellerEventsQuery) {
  const seller = await prisma.sellerProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!seller) throw ApiError.forbidden("Seller profile not found");

  const where: Prisma.EventWhereInput = {
    sellerId: seller.id,
    ...(query.status && { status: query.status }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.event.findMany({
      where,
      include: {
        ticketTypes: {
          select: { id: true, name: true, tier: true, priceCents: true, currency: true, quantity: true, sold: true, isActive: true },
          orderBy: { priceCents: "asc" },
        },
      },
      orderBy: { startsAt: "desc" },
      ...skipTake(query),
    }),
    prisma.event.count({ where }),
  ]);

  return { items, total, page: query.page, limit: query.limit };
}

// Sales and door numbers for one event.
export async function getEventSummary(userId: string, role: Role, eventId: string) {
  const event = await getManagedEvent(userId, role, eventId);

  const [ticketTypes, revenue, issued, checkedIn] = await Promise.all([
    prisma.ticketType.findMany({
      where: { eventId },
      orderBy: { priceCents: "asc" },
      select: { id: true, name: true, tier: true, priceCents: true, currency: true, quantity: true, sold: true, isActive: true },
    }),
    prisma.orderItem.groupBy({
      by: ["ticketTypeId"],
      where: { ticketType: { eventId }, order: { status: "PAID" } },
      _sum: { subtotalCents: true, quantity: true },
    }),
    prisma.ticket.count({ where: { eventId, status: { not: "VOID" } } }),
    prisma.ticket.count({ where: { eventId, status: "USED" } }),
  ]);

  const paidByType = new Map(revenue.map((r) => [r.ticketTypeId, r._sum]));

  const types = ticketTypes.map((t) => ({
    ...t,
    available: Math.max(t.quantity - t.sold, 0), // sold includes unpaid holds
    paidQuantity: paidByType.get(t.id)?.quantity ?? 0,
    revenueCents: paidByType.get(t.id)?.subtotalCents ?? 0,
  }));

  return {
    event: {
      id: event.id,
      title: event.title,
      slug: event.slug,
      status: event.status,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    },
    ticketTypes: types,
    totals: {
      ticketsIssued: issued,
      checkedIn,
      notYetArrived: Math.max(issued - checkedIn, 0),
      revenueCents: types.reduce((sum, t) => sum + t.revenueCents, 0),
      currency: types[0]?.currency ?? null,
    },
  };
}

// Attendee list. Ticket codes are deliberately NOT included.
export async function getEventAttendees(userId: string, role: Role, eventId: string, query: AttendeesQuery) {
  await getManagedEvent(userId, role, eventId);

  const where: Prisma.TicketWhereInput = { eventId, ...(query.status && { status: query.status }) };

  const [items, total] = await prisma.$transaction([
    prisma.ticket.findMany({
      where,
      select: {
        id: true,
        status: true,
        usedAt: true,
        createdAt: true,
        ticketType: { select: { name: true } },
        user: { select: { fullName: true, email: true } },
        order: { select: { reference: true } },
      },
      orderBy: { createdAt: "asc" },
      ...skipTake(query),
    }),
    prisma.ticket.count({ where }),
  ]);

  return { items, total, page: query.page, limit: query.limit };
}
// ==========================================
// END OF FILE: backend/src/modules/sellers/sellers.service.ts
// ==========================================