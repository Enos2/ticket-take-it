// ==========================================
// FILE: backend/src/modules/tickets/tickets.service.ts
// PURPOSE: Logic for adding tickets to an event.
// ==========================================
import { Role } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { CreateTicketTypeInput } from "./tickets.schema";

export async function createTicketType(
  userId: string,
  role: Role,
  eventId: string,
  input: CreateTicketTypeInput
) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { seller: true },
  });
  if (!event) throw ApiError.notFound("Event not found");

  // Admins may manage any event. Sellers need to own it AND be approved.
  if (role !== "ADMIN") {
    if (event.seller.userId !== userId) throw ApiError.forbidden("You do not own this event");
    if (event.seller.status !== "APPROVED") {
      throw ApiError.forbidden("Your seller account has not been approved yet");
    }
  }

  if (event.status === "CANCELLED" || event.status === "COMPLETED" || event.endsAt < new Date()) {
    throw ApiError.badRequest("Tickets cannot be added to an event that has ended or been cancelled");
  }

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