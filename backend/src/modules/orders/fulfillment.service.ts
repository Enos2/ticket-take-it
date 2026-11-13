// ==========================================
// FILE: backend/src/modules/orders/fulfillment.service.ts
// PURPOSE: Issues one ticket (with a QR code secret) per person once an order is paid, and ties tickets to their seats.
// ==========================================
import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { ApiError } from "../../utils/ApiError";

// 128 bits of randomness. Whoever holds this code can enter once, so treat it like a secret.
const newTicketCode = () => randomBytes(16).toString("base64url");

// Gives each seat of the order to one ticket of the same ticket type.
// A seat can be taken by the order that holds it, or (when the seller gives a blocked seat to a guest) while it is blocked.
async function assignSeats(tx: Prisma.TransactionClient, orderId: string) {
  const orderSeats = await tx.orderSeat.findMany({
    where: { orderId },
    select: { seatId: true, seat: { select: { section: { select: { ticketTypeId: true } } } } },
    orderBy: { seatId: "asc" },
  });
  if (orderSeats.length === 0) return;

  const tickets = await tx.ticket.findMany({
    where: { orderId },
    select: { id: true, ticketTypeId: true },
    orderBy: { id: "asc" },
  });

  const freeTickets = new Map<string, string[]>();
  for (const ticket of tickets) {
    const list = freeTickets.get(ticket.ticketTypeId) ?? [];
    list.push(ticket.id);
    freeTickets.set(ticket.ticketTypeId, list);
  }

  for (const orderSeat of orderSeats) {
    const ticketId = freeTickets.get(orderSeat.seat.section.ticketTypeId)?.shift();
    if (!ticketId) throw ApiError.internal("The seats and tickets of this order do not match");

    const claimed = await tx.seat.updateMany({
      where: { id: orderSeat.seatId, ticketId: null, OR: [{ heldByOrderId: orderId }, { isBlocked: true }] },
      data: { ticketId, heldByOrderId: null, heldUntil: null },
    });
    if (claimed.count === 0) throw ApiError.conflict("A seat of this order is no longer available");
  }
}

// Call inside the same transaction that marks the order PAID.
// Idempotent: if tickets already exist for the order, it does nothing.
export async function issueTicketsForOrder(tx: Prisma.TransactionClient, orderId: string): Promise<number> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { ticketType: { select: { eventId: true } } } } },
  });
  if (!order) throw ApiError.notFound("Order not found");
  if (order.status !== "PAID") throw ApiError.internal("Tickets can only be issued for paid orders");

  const existing = await tx.ticket.count({ where: { orderId } });
  if (existing > 0) return existing;

  const data = order.items.flatMap((item) =>
    Array.from({ length: item.quantity }, () => ({
      code: newTicketCode(),
      orderId: order.id,
      orderItemId: item.id,
      ticketTypeId: item.ticketTypeId,
      eventId: item.ticketType.eventId,
      userId: order.userId,
    }))
  );

  await tx.ticket.createMany({ data });
  await assignSeats(tx, orderId);
  return data.length;
}
// ==========================================
// END OF FILE: backend/src/modules/orders/fulfillment.service.ts
// ==========================================