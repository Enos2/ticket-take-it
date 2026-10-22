// ==========================================
// FILE: backend/src/modules/events/event.access.ts
// PURPOSE: One place that decides who may manage an event.
// ==========================================
import { Role } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";

// Admins manage any event. Sellers need to own it AND be approved.
export async function getManagedEvent(userId: string, role: Role, eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { seller: { select: { userId: true, status: true } } },
  });
  if (!event) throw ApiError.notFound("Event not found");

  if (role !== "ADMIN") {
    if (event.seller.userId !== userId) throw ApiError.forbidden("You do not own this event");
    if (event.seller.status !== "APPROVED") throw ApiError.forbidden("Your seller account is not active");
  }

  return event;
}
// ==========================================
// END OF FILE: backend/src/modules/events/event.access.ts
// ==========================================