// ==========================================
// FILE: backend/src/modules/events/events.service.ts
// PURPOSE: Business logic for creating, managing and fetching events.
// ==========================================
import { randomBytes } from "crypto";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { background } from "../../utils/background";
import { notifyEventCancelled } from "../notifications/notifications.service";
import { releaseStock } from "../orders/orders.service";
import { getManagedEvent } from "./event.access";
import { CreateEventInput, UpdateEventInput, ListEventsQuery } from "./events.schema";

// URL-friendly slug with a random suffix to avoid collisions.
export function generateSlug(title: string): string {
  const base =
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "event";

  return `${base}-${randomBytes(3).toString("hex")}`;
}

const MAX_SLUG_ATTEMPTS = 3;

// Only tickets that are on sale, cheapest first.
const activeTickets = {
  where: { isActive: true },
  orderBy: { priceCents: "asc" },
} satisfies Prisma.Event$ticketTypesArgs;

export async function createEvent(userId: string, input: CreateEventInput) {
  const seller = await prisma.sellerProfile.findUnique({ where: { userId } });
  if (!seller) throw ApiError.forbidden("You must be a seller to create events");
  if (seller.status !== "APPROVED") {
    throw ApiError.forbidden("Your seller account has not been approved yet");
  }

  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    try {
      return await prisma.event.create({
        data: {
          sellerId: seller.id,
          title: input.title,
          slug: generateSlug(input.title),
          description: input.description,
          venue: input.venue,
          city: input.city,
          country: input.country, category: input.category,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          bannerUrl: input.bannerUrl,
          status: "DRAFT", // sellers add tickets, submit for review, and an admin approves
        },
      });
    } catch (err) {
      const isSlugCollision =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (!isSlugCollision || attempt === MAX_SLUG_ATTEMPTS) throw err;
    }
  }

  // Unreachable, keeps TypeScript satisfied.
  throw ApiError.badRequest("Could not create event");
}

export async function getAllEvents({ page, limit }: ListEventsQuery) {
  const where: Prisma.EventWhereInput = {
    status: "PUBLISHED",
    endsAt: { gte: new Date() }, // hide events that have already ended
  };

  const [items, total] = await prisma.$transaction([
    prisma.event.findMany({
      where,
      include: { ticketTypes: activeTickets }, // so users can see prices
      orderBy: { startsAt: "asc" },
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.event.count({ where }),
  ]);

  return { items, total, page, limit };
}

export async function getEventBySlug(slug: string) {
  const event = await prisma.event.findFirst({
    where: { slug, status: "PUBLISHED" },
    include: { ticketTypes: activeTickets },
  });
  if (!event) throw ApiError.notFound("Event not found");
  return event;
}

export async function updateEvent(userId: string, role: Role, eventId: string, input: UpdateEventInput) {
  const event = await getManagedEvent(userId, role, eventId);
  if (event.status === "CANCELLED" || event.status === "COMPLETED") {
    throw ApiError.badRequest("This event can no longer be edited");
  }
  if (event.status === "PENDING_REVIEW") {
    // Otherwise a seller could change an event after it was submitted for review.
    throw ApiError.badRequest("This event is waiting for review. Withdraw it from review to edit it.");
  }

  const now = new Date();
  const startsAt = input.startsAt ? new Date(input.startsAt) : event.startsAt;
  const endsAt = input.endsAt ? new Date(input.endsAt) : event.endsAt;

  if (input.startsAt && startsAt <= now) throw ApiError.badRequest("startsAt must be in the future");
  if (endsAt <= startsAt) throw ApiError.badRequest("endsAt must be after startsAt");

  if (input.endsAt) {
    const tooLate = await prisma.ticketType.count({
      where: { eventId, tier: "EARLY_BIRD", endsAt: { gt: endsAt } },
    });
    if (tooLate > 0) {
      throw ApiError.badRequest("An early bird window ends after the new event end time. Edit those ticket types first.");
    }
  }

  // The slug stays the same so existing links keep working.
  return await prisma.event.update({
    where: { id: eventId },
    data: {
      title: input.title,
      description: input.description,
      venue: input.venue,
      city: input.city,
      country: input.country, category: input.category,
      startsAt: input.startsAt ? startsAt : undefined,
      endsAt: input.endsAt ? endsAt : undefined,
      bannerUrl: input.bannerUrl, // null clears it
    },
  });
}

// Admin-only direct publish of a draft. Sellers go through moderation.submitEvent instead.
export async function publishEvent(userId: string, role: Role, eventId: string) {
  const event = await getManagedEvent(userId, role, eventId);
  if (event.status === "PUBLISHED") return event;
  if (event.status !== "DRAFT") throw ApiError.badRequest(`Cannot publish an event that is ${event.status.toLowerCase()}`);
  if (event.endsAt < new Date()) throw ApiError.badRequest("This event has already ended");

  const activeTypes = await prisma.ticketType.count({ where: { eventId, isActive: true } });
  if (activeTypes === 0) throw ApiError.badRequest("Add at least one active ticket type before publishing");

  const now = new Date();
  const flipped = await prisma.event.updateMany({
    where: { id: eventId, status: "DRAFT" },
    data: { status: "PUBLISHED", submittedAt: now, reviewedAt: now, reviewedById: userId, reviewNote: null },
  });
  if (flipped.count === 0) throw ApiError.conflict("The event changed while publishing. Please refresh.");

  return await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
}

// Takes a live event with no sales back to a draft. It needs approval again before it goes live.
export async function unpublishEvent(userId: string, role: Role, eventId: string) {
  const event = await getManagedEvent(userId, role, eventId);
  if (event.status === "DRAFT") return event;
  if (event.status !== "PUBLISHED") throw ApiError.badRequest(`Cannot unpublish an event that is ${event.status.toLowerCase()}`);

  const issued = await prisma.ticket.count({ where: { eventId, status: { not: "VOID" } } });
  if (issued > 0) throw ApiError.conflict("This event already has ticket sales. Cancel it instead of unpublishing.");

  const flipped = await prisma.event.updateMany({
    where: { id: eventId, status: "PUBLISHED" },
    data: { status: "DRAFT", submittedAt: null },
  });
  if (flipped.count === 0) throw ApiError.conflict("The event changed while unpublishing. Please refresh.");

  return await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
}

// Cancels the event, stops sales, voids issued tickets, releases unpaid orders and emails buyers.
// Paid orders stay PAID until an admin refunds them (POST /admin/events/:id/refund-orders).
export async function cancelEvent(userId: string, role: Role, eventId: string) {
  const event = await getManagedEvent(userId, role, eventId);
  if (event.status === "COMPLETED") throw ApiError.badRequest("A completed event cannot be cancelled");

  const newlyCancelled = event.status !== "CANCELLED";

  if (newlyCancelled) {
    await prisma.$transaction(async (tx) => {
      const flipped = await tx.event.updateMany({
        where: {
          id: eventId,
          status: { in: ["DRAFT", "PENDING_REVIEW", "REJECTED", "PUBLISHED", "SOLD_OUT", "TAKEN_DOWN"] },
        },
        data: { status: "CANCELLED" },
      });
      if (flipped.count === 0) throw ApiError.conflict("The event changed while cancelling. Please refresh.");

      await tx.ticketType.updateMany({ where: { eventId }, data: { isActive: false } });
      await tx.ticket.updateMany({ where: { eventId, status: "VALID" }, data: { status: "VOID" } });

      // Unpaid orders that include this event can no longer be paid. Release them.
      const unpaid = await tx.order.findMany({
        where: {
          status: { in: ["PENDING", "RESERVED"] },
          items: { some: { ticketType: { eventId } } },
        },
        include: { items: true },
      });

      for (const order of unpaid) {
        const flippedOrder = await tx.order.updateMany({
          where: { id: order.id, status: { in: ["PENDING", "RESERVED"] } },
          data: { status: "CANCELLED" },
        });
        if (flippedOrder.count > 0) await releaseStock(tx, order.items);
      }
    });
  }

  const [updated, paidOrdersToRefund] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId } }),
    prisma.order.count({
      where: { status: "PAID", items: { some: { ticketType: { eventId } } } },
    }),
  ]);

  if (newlyCancelled) background(notifyEventCancelled(eventId), "event cancelled emails");

  return { event: updated, paidOrdersToRefund };
}

// Only events that never had an order can be deleted. Otherwise cancel.
export async function deleteEvent(userId: string, role: Role, eventId: string) {
  await getManagedEvent(userId, role, eventId);

  const ordered = await prisma.orderItem.count({ where: { ticketType: { eventId } } });
  if (ordered > 0) throw ApiError.conflict("This event has orders. Cancel it instead of deleting it.");

  await prisma.event.delete({ where: { id: eventId } });
}
// ==========================================
// END OF FILE: backend/src/modules/events/events.service.ts
// ==========================================