// ==========================================
// FILE: backend/src/modules/tickets/tickets.service.ts
// PURPOSE: Logic for adding, editing and removing ticket types, including tickets held back for the seller.
// ==========================================
import { Role } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { getManagedEvent } from "../events/event.access";
import {
  capacityRoom,
  lockEvent,
  lockTicketType,
  reservedRemaining,
  syncSoldOut,
  typeAvailable,
} from "../events/capacity.service";
import { CreateTicketTypeInput, UpdateTicketTypeInput } from "./tickets.schema";

function assertEventEditable(event: { status: string; endsAt: Date }) {
  if (event.status === "PENDING_REVIEW") {
    throw ApiError.badRequest("This event is waiting for review. Withdraw it from review to change its tickets.");
  }
  if (event.status === "CANCELLED" || event.status === "COMPLETED" || event.endsAt < new Date()) {
    throw ApiError.badRequest("Tickets cannot be changed on an event that has ended or been cancelled");
  }
}

export async function createTicketType(
  userId: string,
  role: Role,
  eventId: string,
  input: CreateTicketTypeInput
) {
  const event = await getManagedEvent(userId, role, eventId);
  assertEventEditable(event);

  if (input.endsAt && new Date(input.endsAt) > event.endsAt) {
    throw ApiError.badRequest("The early bird window must end before the event ends");
  }

  // One event, one currency. Orders reject mixed currencies, so mixed tickets could never be bought together.
  const existing = await prisma.ticketType.findFirst({
    where: { eventId },
    select: { currency: true },
  });
  if (existing && existing.currency !== input.currency) {
    throw ApiError.badRequest(`This event sells tickets in ${existing.currency}. Use the same currency for every ticket type.`);
  }

  return await prisma.$transaction(async (tx) => {
    await lockEvent(tx, eventId);

    // Held-back tickets count against the event capacity from the moment they are reserved.
    const fresh = await tx.event.findUniqueOrThrow({ where: { id: eventId }, select: { maxCapacity: true } });
    if (fresh.maxCapacity !== null && input.hostReserved > 0) {
      const room = await capacityRoom(tx, eventId, fresh.maxCapacity);
      if (input.hostReserved > room) {
        throw ApiError.badRequest(
          `Only ${Math.max(room, 0)} spot(s) are left in this event's capacity of ${fresh.maxCapacity}`
        );
      }
    }

    const created = await tx.ticketType.create({
      data: {
        eventId,
        name: input.name,
        description: input.description,
        tier: input.tier,
        priceCents: input.priceCents,
        currency: input.currency,
        quantity: input.quantity,
        hostReserved: input.hostReserved,
        isGroup: input.isGroup,
        minGroupSize: input.minGroupSize,
        maxGroupSize: input.maxGroupSize,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
      },
    });

    // A new ticket type can put a sold-out event back on sale.
    await syncSoldOut(tx, [eventId]);
    return created;
  });
}

export async function updateTicketType(
  userId: string,
  role: Role,
  eventId: string,
  ticketId: string,
  input: UpdateTicketTypeInput
) {
  const event = await getManagedEvent(userId, role, eventId);
  assertEventEditable(event);

  return await prisma.$transaction(async (tx) => {
    // Locks first, then reads, so every number below is current and no purchase can slip in between.
    await lockEvent(tx, eventId);
    await lockTicketType(tx, ticketId);

    const ticket = await tx.ticketType.findFirst({ where: { id: ticketId, eventId } });
    if (!ticket) throw ApiError.notFound("Ticket type not found");

    const fresh = await tx.event.findUniqueOrThrow({ where: { id: eventId }, select: { maxCapacity: true } });

    // M-Pesa takes whole shillings only.
    if (input.priceCents !== undefined && ticket.currency === "KES" && input.priceCents % 100 !== 0) {
      throw ApiError.badRequest("KES prices must be whole shillings (a multiple of 100 cents)");
    }

    const quantity = input.quantity ?? ticket.quantity;
    if (quantity < ticket.sold) {
      throw ApiError.badRequest(`Quantity cannot go below the ${ticket.sold} already sold or reserved`);
    }

    // Held-back tickets
    const hostReserved = input.hostReserved ?? ticket.hostReserved;
    if (hostReserved < ticket.hostIssued) {
      throw ApiError.badRequest(
        `${ticket.hostIssued} ticket(s) were already given out, so the reserved number cannot go below that`
      );
    }
    const newHeld = hostReserved - ticket.hostIssued;
    if (quantity < ticket.sold + newHeld) {
      throw ApiError.badRequest(
        `Quantity cannot go below the ${ticket.sold + newHeld} already sold, held for buyers or reserved for guests`
      );
    }
    const extraHeld = newHeld - reservedRemaining(ticket);
    if (extraHeld > 0 && fresh.maxCapacity !== null) {
      const room = await capacityRoom(tx, eventId, fresh.maxCapacity);
      if (extraHeld > room) {
        throw ApiError.badRequest(
          `Only ${Math.max(room, 0)} spot(s) are left in this event's capacity of ${fresh.maxCapacity}`
        );
      }
    }

    // Group limits
    if (ticket.isGroup) {
      const min = input.minGroupSize ?? ticket.minGroupSize;
      const max = input.maxGroupSize ?? ticket.maxGroupSize;
      if (!min || !max || max < min) throw ApiError.badRequest("maxGroupSize must be at least minGroupSize");
      if (max > quantity) throw ApiError.badRequest("maxGroupSize cannot exceed the ticket quantity");
    } else if (input.minGroupSize !== undefined || input.maxGroupSize !== undefined) {
      throw ApiError.badRequest("Group sizes only apply to group tickets");
    }

    // Early bird window
    if (ticket.tier === "EARLY_BIRD") {
      const startsAt = input.startsAt ? new Date(input.startsAt) : ticket.startsAt;
      const endsAt = input.endsAt ? new Date(input.endsAt) : ticket.endsAt;
      if (!startsAt || !endsAt || endsAt <= startsAt) throw ApiError.badRequest("endsAt must be after startsAt");
      if (endsAt > event.endsAt) throw ApiError.badRequest("The early bird window must end before the event ends");
    } else if (input.startsAt !== undefined || input.endsAt !== undefined) {
      throw ApiError.badRequest("Date windows only apply to early bird tickets");
    }

    const updated = await tx.ticketType.update({
      where: { id: ticketId },
      data: {
        name: input.name,
        description: input.description,
        priceCents: input.priceCents,
        quantity: input.quantity,
        hostReserved: input.hostReserved,
        isActive: input.isActive,
        minGroupSize: input.minGroupSize,
        maxGroupSize: input.maxGroupSize,
        startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
        endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
      },
    });

    // More stock puts a sold-out event back on sale. Less stock can sell it out.
    await syncSoldOut(tx, [eventId]);
    return updated;
  });
}

// Only never-ordered ticket types can be deleted. Otherwise deactivate with PATCH { isActive: false }.
export async function deleteTicketType(userId: string, role: Role, eventId: string, ticketId: string) {
  await getManagedEvent(userId, role, eventId);

  const ticket = await prisma.ticketType.findFirst({ where: { id: ticketId, eventId }, select: { id: true } });
  if (!ticket) throw ApiError.notFound("Ticket type not found");

  const ordered = await prisma.orderItem.count({ where: { ticketTypeId: ticketId } });
  if (ordered > 0) {
    throw ApiError.conflict("This ticket type has been ordered. Deactivate it instead (set isActive to false).");
  }

  await prisma.ticketType.delete({ where: { id: ticketId } });
  await syncSoldOut(prisma, [eventId]);
}

export async function getTicketsForEvent(eventId: string) {
  // Only expose tickets for events that are on sale or sold out.
  const event = await prisma.event.findFirst({
    where: { id: eventId, status: { in: ["PUBLISHED", "SOLD_OUT"] } },
    select: { id: true, maxCapacity: true },
  });
  if (!event) throw ApiError.notFound("Event not found");

  const all = await prisma.ticketType.findMany({
    where: { eventId },
    orderBy: { priceCents: "asc" },
  });

  // Whatever the event capacity still allows, across every ticket type together.
  const committed = all.reduce((sum, t) => sum + t.sold + reservedRemaining(t), 0);
  const room = event.maxCapacity === null ? Infinity : Math.max(event.maxCapacity - committed, 0);

  // Show how many are left instead of the raw numbers. Held-back counts are private to the seller.
  return all
    .filter((t) => t.isActive)
    .map(({ sold, hostReserved, hostIssued, ...ticket }) => ({
      ...ticket,
      available: Math.min(typeAvailable({ ...ticket, sold, hostReserved, hostIssued }), room),
    }));
}
// ==========================================
// END OF FILE: backend/src/modules/tickets/tickets.service.ts
// ==========================================