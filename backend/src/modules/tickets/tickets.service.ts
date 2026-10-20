// ==========================================
// FILE: backend/src/modules/tickets/tickets.service.ts
// PURPOSE: Logic for adding tickets to an event.
// ==========================================
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { CreateTicketTypeInput } from "./tickets.schema";

export async function createTicketType(userId: string, eventId: string, input: CreateTicketTypeInput) {
  // 1. Verify the event exists and belongs to this seller
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { seller: true },
  });

  if (!event) throw ApiError.notFound("Event not found");
  if (event.seller.userId !== userId) throw ApiError.forbidden("You do not own this event");

  // 2. Create the ticket type
  return await prisma.ticketType.create({
    data: {
      eventId,
      name: input.name,
      description: input.description,
      tier: input.tier,
      priceCents: input.priceCents,
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
  return await prisma.ticketType.findMany({
    where: { eventId, isActive: true },
    orderBy: { priceCents: "asc" },
  });
}
// ==========================================
// END OF FILE: backend/src/modules/tickets/tickets.service.ts
// LOCATION: backend/src/modules/tickets/tickets.service.ts
// LAST UPDATED: October 19, 2026
// ==========================================