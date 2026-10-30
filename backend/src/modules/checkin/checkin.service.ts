// ==========================================
// FILE: backend/src/modules/checkin/checkin.service.ts
// PURPOSE: Validates a scanned ticket and admits the holder exactly once, inside the event's entry window.
// ==========================================
import { Role } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";

// Doors can open early, and late arrivals still need to get in. Admins can override both.
const OPENS_BEFORE_MS = 12 * 60 * 60 * 1000;
const CLOSES_AFTER_MS = 6 * 60 * 60 * 1000;

export async function checkInTicket(userId: string, role: Role, code: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { code },
    include: {
      event: {
        select: {
          id: true,
          title: true,
          status: true,
          startsAt: true,
          endsAt: true,
          seller: { select: { userId: true, status: true } },
        },
      },
      ticketType: { select: { name: true } },
      user: { select: { fullName: true } },
    },
  });
  if (!ticket) throw ApiError.notFound("Invalid ticket");

  // Admins can scan anything. Sellers only for their own events, and only while approved.
  if (role !== "ADMIN") {
    if (ticket.event.seller.userId !== userId) {
      throw ApiError.forbidden("This ticket is for an event you do not manage");
    }
    if (ticket.event.seller.status !== "APPROVED") {
      throw ApiError.forbidden("Your seller account is not active");
    }
  }

  if (ticket.event.status === "CANCELLED") throw ApiError.conflict("This event was cancelled");
  if (ticket.status === "VOID") throw ApiError.conflict("Ticket is void (refunded or cancelled)");

  // Entry window. A forged or leaked code is useless days before the event, or long after it.
  if (role !== "ADMIN") {
    const now = Date.now();
    const opensAt = new Date(ticket.event.startsAt.getTime() - OPENS_BEFORE_MS);
    const closedAt = new Date(ticket.event.endsAt.getTime() + CLOSES_AFTER_MS);

    if (now < opensAt.getTime()) throw ApiError.conflict(`Check-in for this event opens at ${opensAt.toISOString()}`);
    if (now > closedAt.getTime()) throw ApiError.conflict("This event has ended, so check-in is closed");
  }

  // ATOMIC: only one scan can flip VALID -> USED, even if two scanners read the code at once.
  const now = new Date();
  const claimed = await prisma.ticket.updateMany({
    where: { id: ticket.id, status: "VALID" },
    data: { status: "USED", usedAt: now, checkedInById: userId },
  });

  if (claimed.count === 0) {
    const current = await prisma.ticket.findUnique({
      where: { id: ticket.id },
      select: { status: true, usedAt: true },
    });
    if (current?.status === "USED") {
      throw ApiError.conflict(
        `Ticket already used${current.usedAt ? ` at ${current.usedAt.toISOString()}` : ""}`
      );
    }
    throw ApiError.conflict("Ticket can no longer be used");
  }

  return {
    ticketId: ticket.id,
    event: ticket.event.title,
    ticketType: ticket.ticketType.name,
    holder: ticket.user.fullName,
    checkedInAt: now,
  };
}
// ==========================================
// END OF FILE: backend/src/modules/checkin/checkin.service.ts
// ==========================================