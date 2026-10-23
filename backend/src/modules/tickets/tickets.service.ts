// ==========================================
// FILE: backend/src/modules/tickets/tickets.service.ts
// PURPOSE: Logic for adding, editing and removing ticket types.
// ==========================================
import { Role } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { getManagedEvent } from "../events/event.access";
import { CreateTicketTypeInput, UpdateTicketTypeInput } from "./tickets.schema";

function assertEventEditable(event: { status: string; endsAt: Date }) {
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

  return await prisma.ticketType.create({
    data: {
      eventId,
      name: input.name,
      description: input.description,
      tier: input.tier,
      priceCents: input.priceCents,
      currency: input.currency,
      quantity: input.quantity,
      isGroup: input.isGroup,
      minGroupSize: input.minGroupSize,
      maxGroupSize: input.maxGroupSize,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
    },
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

  const ticket = await prisma.ticketType.findFirst({ where: { id: ticketId, eventId } });
  if (!ticket) throw ApiError.notFound("Ticket type not found");

  // M-Pesa takes whole shillings only.
  if (input.priceCents !== undefined && ticket.currency === "KES" && input.priceCents % 100 !== 0) {
    throw ApiError.badRequest("KES prices must be whole shillings (a multiple of 100 cents)");
  }

  const quantity = input.quantity ?? ticket.quantity;
  if (quantity < ticket.sold) {
    throw ApiError.badRequest(`Quantity cannot go below the ${ticket.sold} already sold or reserved`);
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

  // The `sold <= quantity` guard stops a concurrent purchase from slipping under the new limit.
  const updated = await prisma.ticketType.updateMany({
    where: { id: ticketId, eventId, sold: { lte: quantity } },
    data: {
      name: input.name,
      description: input.description,
      priceCents: input.priceCents,
      quantity: input.quantity,
      isActive: input.isActive,
      minGroupSize: input.minGroupSize,
      maxGroupSize: input.maxGroupSize,
      startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
      endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
    },
  });
  if (updated.count === 0) throw ApiError.conflict("Tickets were just sold. Please refresh and try again.");

  return await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketId } });
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
}

export async function getTicketsForEvent(eventId: string) {
  // Only expose tickets for events that are actually on sale.
  const event = await prisma.event.findFirst({
    where: { id: eventId, status: "PUBLISHED" },
    select: { id: true },
  });
  if (!event) throw ApiError.notFound("Event not found");

  const tickets = await prisma.ticketType.findMany({
    where: { eventId, isActive: true },
    orderBy: { priceCents: "asc" },
  });

  // Show how many are left instead of the raw sold count.
  return tickets.map(({ sold, ...ticket }) => ({
    ...ticket,
    available: Math.max(ticket.quantity - sold, 0),
  }));
}
// ==========================================
// END OF FILE: backend/src/modules/tickets/tickets.service.ts
// ==========================================