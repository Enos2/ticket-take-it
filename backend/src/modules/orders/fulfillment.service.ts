// ==========================================
// FILE: backend/src/modules/orders/fulfillment.service.ts
// PURPOSE: Issues one ticket (with a QR code secret) per person once an order is paid.
// ==========================================
import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { ApiError } from "../../utils/ApiError";

// 128 bits of randomness. Whoever holds this code can enter once, so treat it like a secret.
const newTicketCode = () => randomBytes(16).toString("base64url");

// Call inside the same transaction that marks the order PAID.
// Idempotent: if tickets already exist for the order, it does nothing.
export async function issueTicketsForOrder(tx: Prisma.TransactionClient, orderId: string): Promise<number> {
  const ticket = (tx as unknown as {
    ticket: {
      count(args: { where: { orderId: string } }): Promise<number>;
      createMany(args: {
        data: Array<{
          code: string;
          orderId: string;
          orderItemId: string;
          ticketTypeId: string;
          eventId: string;
          userId: string;
        }>;
      }): Promise<unknown>;
    };
  }).ticket;

  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { ticketType: { select: { eventId: true } } } } },
  });
  if (!order) throw ApiError.notFound("Order not found");
  if (order.status !== "PAID") throw ApiError.internal("Tickets can only be issued for paid orders");

  const existing = await ticket.count({ where: { orderId } });
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

  await ticket.createMany({ data });
  return data.length;
}
// ==========================================
// END OF FILE: backend/src/modules/orders/fulfillment.service.ts
// ==========================================