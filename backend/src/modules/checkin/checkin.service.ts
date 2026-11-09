// ==========================================
// FILE: backend/src/modules/checkin/checkin.service.ts
// PURPOSE: Validates a scanned ticket and admits the holder exactly once, at the right event and gate, inside the entry window.
// ==========================================
import { Role, TicketTier } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { CLOSES_AFTER_MS, OPENS_BEFORE_MS, staffSellerIds } from "../door/door.service";

export interface CheckInActor {
  id: string;
  email: string;
  role: Role;
  emailVerified: boolean;
}

export interface ScanInput {
  code: string;
  eventId?: string; // the event being scanned for. A ticket for any other event is refused.
  gateId?: string;
}

const TIER_NAME: Record<TicketTier, string> = {
  EARLY_BIRD: "Early bird",
  REGULAR: "Regular",
  VIP: "VIP",
  VVIP: "VVIP",
  GROUP: "Group",
};

export async function checkInTicket(actor: CheckInActor, input: ScanInput) {
  const ticket = await prisma.ticket.findUnique({
    where: { code: input.code },
    include: {
      event: {
        select: {
          id: true,
          title: true,
          status: true,
          startsAt: true,
          endsAt: true,
          sellerId: true,
          seller: { select: { userId: true, status: true } },
        },
      },
      ticketType: { select: { name: true, tier: true } },
      user: { select: { fullName: true } },
    },
  });
  if (!ticket) throw ApiError.notFound("Invalid ticket");

  // Admins can scan anything. Organisers scan their own events, and door staff scan for the organiser who added them.
  if (actor.role !== "ADMIN") {
    const own = ticket.event.seller.userId === actor.id;
    const staff = !own && (await staffSellerIds(actor.id, actor.email, actor.emailVerified)).includes(ticket.event.sellerId);
    if (!own && !staff) throw ApiError.forbidden("This ticket is for an event you do not manage");
    if (ticket.event.seller.status !== "APPROVED") throw ApiError.forbidden("This organizer's account is not active");
  }

  // The scanner is set to one event. A ticket from another event, even the same organiser's, must not get in here.
  if (input.eventId && input.eventId !== ticket.event.id) {
    throw ApiError.conflict(`This ticket is for "${ticket.event.title}", not the event you are scanning for`);
  }

  let gate: { id: string; name: string; allowedTiers: TicketTier[] } | null = null;
  if (input.gateId) {
    gate = await prisma.gate.findFirst({
      where: { id: input.gateId, eventId: ticket.event.id },
      select: { id: true, name: true, allowedTiers: true },
    });
    if (!gate) throw ApiError.badRequest("That gate does not belong to this event");

    if (gate.allowedTiers.length > 0 && !gate.allowedTiers.includes(ticket.ticketType.tier)) {
      const allowed = gate.allowedTiers.map((t) => TIER_NAME[t]).join(" and ");
      throw ApiError.conflict(
        `${gate.name} admits ${allowed} tickets only. This ticket is ${TIER_NAME[ticket.ticketType.tier]}. Send the person to the right entrance.`
      );
    }
  }

  if (ticket.event.status === "CANCELLED") throw ApiError.conflict("This event was cancelled");
  if (ticket.status === "VOID") throw ApiError.conflict("Ticket is void (refunded or cancelled)");

  // Entry window. A forged or leaked code is useless days before the event, or long after it.
  if (actor.role !== "ADMIN") {
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
    data: { status: "USED", usedAt: now, checkedInById: actor.id, gateId: gate ? gate.id : undefined },
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
    gate: gate ? gate.name : null,
  };
}
// ==========================================
// END OF FILE: backend/src/modules/checkin/checkin.service.ts
// ==========================================