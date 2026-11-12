// ==========================================
// FILE: backend/src/modules/events/comps.service.ts
// PURPOSE: Lets a seller give out the tickets they held back, see who has them, and take them back.
// ==========================================
import { randomBytes } from "crypto";
import { Role } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { background } from "../../utils/background";
import { issueTicketsForOrder } from "../orders/fulfillment.service";
import { notifyOrderPaid } from "../notifications/notifications.service";
import { getManagedEvent } from "./event.access";
import { reservedRemaining } from "./capacity.service";
import { IssueCompInput } from "./comps.schema";

// Gives free tickets from the held-back pool to a registered user. The guest gets a normal paid-style order
// worth 0, so the tickets show up in their account and work at the door like any other ticket.
export async function issueComps(userId: string, role: Role, eventId: string, input: IssueCompInput) {
  const event = await getManagedEvent(userId, role, eventId);
  if (event.status !== "PUBLISHED" && event.status !== "SOLD_OUT") {
    throw ApiError.badRequest("Tickets can only be given out while the event is on sale");
  }
  if (event.endsAt < new Date()) throw ApiError.badRequest("This event has already ended");

  const recipient = await prisma.user.findFirst({
    where: { email: input.recipientEmail, isActive: true, deletedAt: null },
    select: { id: true, email: true, fullName: true },
  });
  if (!recipient) {
    throw ApiError.notFound("No account uses that email. Ask your guest to sign up first, then try again.");
  }

  const type = await prisma.ticketType.findFirst({ where: { id: input.ticketTypeId, eventId } });
  if (!type) throw ApiError.notFound("Ticket type not found");

  const quantity = input.quantity;

  const order = await prisma.$transaction(async (tx) => {
    // Takes from the held-back pool only. Public stock and event capacity are not affected:
    // those tickets were already counted as taken when they were held back.
    const claimed = await tx.$executeRaw`
      UPDATE "TicketType"
      SET "sold" = "sold" + ${quantity}, "hostIssued" = "hostIssued" + ${quantity}, "updatedAt" = NOW()
      WHERE "id" = ${type.id} AND "hostReserved" - "hostIssued" >= ${quantity}`;

    if (claimed === 0) {
      const fresh = await tx.ticketType.findUniqueOrThrow({
        where: { id: type.id },
        select: { hostReserved: true, hostIssued: true },
      });
      const left = Math.max(fresh.hostReserved - fresh.hostIssued, 0);
      throw ApiError.badRequest(
        left === 0
          ? `No ${type.name} tickets are held back for you. Reserve some on the ticket type first.`
          : `Only ${left} ${type.name} ticket(s) are held back for you. Reserve more first.`
      );
    }

    const created = await tx.order.create({
      data: {
        reference: `CMP-${randomBytes(5).toString("hex").toUpperCase()}`,
        userId: recipient.id,
        status: "PAID",
        totalCents: 0,
        currency: type.currency,
        paidAt: new Date(),
        isComp: true,
        compIssuedById: userId,
        compNote: input.note ?? null,
        items: { create: [{ ticketTypeId: type.id, quantity, unitPriceCents: 0, subtotalCents: 0 }] },
      },
    });

    await issueTicketsForOrder(tx, created.id);
    return created;
  });

  background(notifyOrderPaid(order.id), "complimentary ticket email");

  return {
    orderId: order.id,
    reference: order.reference,
    eventTitle: event.title,
    ticketType: type.name,
    quantity,
    recipient: { email: recipient.email, fullName: recipient.fullName },
  };
}

// The held-back numbers per ticket type, and everyone who was given tickets.
export async function listComps(userId: string, role: Role, eventId: string) {
  await getManagedEvent(userId, role, eventId);

  const [types, orders] = await Promise.all([
    prisma.ticketType.findMany({
      where: { eventId },
      orderBy: [{ priceCents: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, tier: true, isActive: true, hostReserved: true, hostIssued: true },
    }),
    prisma.order.findMany({
      where: { isComp: true, items: { some: { ticketType: { eventId } } } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        reference: true,
        compNote: true,
        createdAt: true,
        user: { select: { fullName: true, email: true } },
        items: { select: { quantity: true, ticketType: { select: { name: true } } } },
        tickets: { select: { id: true, status: true } },
      },
    }),
  ]);

  return {
    reservations: types.map((t) => ({
      ticketTypeId: t.id,
      name: t.name,
      tier: t.tier,
      isActive: t.isActive,
      reserved: t.hostReserved,
      givenOut: t.hostIssued,
      remaining: reservedRemaining(t),
    })),
    comps: orders.map((o) => ({
      orderId: o.id,
      reference: o.reference,
      note: o.compNote,
      createdAt: o.createdAt,
      recipient: o.user,
      ticketType: o.items[0]?.ticketType.name ?? null,
      quantity: o.items.reduce((sum, i) => sum + i.quantity, 0),
      tickets: o.tickets, // ids and status only. Ticket codes are never shown here.
    })),
  };
}

// Takes back an unused complimentary ticket. It goes back into the held-back pool, not into public sale.
export async function revokeComp(userId: string, role: Role, eventId: string, ticketId: string) {
  await getManagedEvent(userId, role, eventId);

  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, eventId, order: { isComp: true } },
    select: { id: true, orderId: true, ticketTypeId: true },
  });
  if (!ticket) throw ApiError.notFound("Complimentary ticket not found");

  await prisma.$transaction(async (tx) => {
    const voided = await tx.ticket.updateMany({ where: { id: ticket.id, status: "VALID" }, data: { status: "VOID" } });
    if (voided.count === 0) throw ApiError.conflict("This ticket was already used or revoked");

    await tx.ticketType.update({
      where: { id: ticket.ticketTypeId },
      data: { sold: { decrement: 1 }, hostIssued: { decrement: 1 } },
    });

    // When every ticket of a complimentary order is gone, the order is closed too.
    const stillHeld = await tx.ticket.count({ where: { orderId: ticket.orderId, status: { not: "VOID" } } });
    if (stillHeld === 0) {
      await tx.order.updateMany({ where: { id: ticket.orderId, status: "PAID" }, data: { status: "CANCELLED" } });
    }
  });
}
// ==========================================
// END OF FILE: backend/src/modules/events/comps.service.ts
// ==========================================