// ==========================================
// FILE: backend/src/modules/orders/orders.service.ts
// PURPOSE: Core purchase logic. Enforces Early-Bird/Group rules and prevents overselling.
// ==========================================
import { randomBytes } from "crypto";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { CreateOrderInput } from "./orders.schema";

// How long an unpaid order holds its tickets before they are released.
export const ORDER_HOLD_MINUTES = 15;

interface OrderItemData {
  ticketTypeId: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
}

export async function createOrder(userId: string, input: CreateOrderInput) {
  // 1. Merge duplicate lines so the same ticket can't be split to dodge group limits.
  const merged = new Map<string, number>();
  for (const { ticketTypeId, quantity } of input.items) {
    merged.set(ticketTypeId, (merged.get(ticketTypeId) ?? 0) + quantity);
  }

  // 2. Always process tickets in the same order so concurrent orders can't deadlock.
  const items = [...merged.entries()]
    .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }))
    .sort((a, b) => (a.ticketTypeId < b.ticketTypeId ? -1 : 1));

  // If ANY item fails (sold out, wrong date, bad group size), the whole order rolls back.
  return await prisma.$transaction(async (tx) => {
    let totalCents = 0;
    let currency: string | null = null;
    const orderItemsData: OrderItemData[] = [];
    const now = new Date();

    for (const item of items) {
      const ticket = await tx.ticketType.findUnique({
        where: { id: item.ticketTypeId },
        include: { event: true },
      });

      if (!ticket) throw ApiError.notFound(`Ticket type ${item.ticketTypeId} not found`);
      if (!ticket.isActive) throw ApiError.badRequest(`Ticket ${ticket.name} is no longer active`);

      // One order, one currency.
      if (currency === null) {
        currency = ticket.currency;
      } else if (ticket.currency !== currency) {
        throw ApiError.badRequest("All tickets in one order must use the same currency");
      }

      // Event must be on sale and not finished.
      if (ticket.event.status !== "PUBLISHED" || ticket.event.endsAt < now) {
        throw ApiError.badRequest(`Tickets for ${ticket.event.title} are no longer on sale`);
      }

      // Early Bird window
      if (ticket.tier === "EARLY_BIRD") {
        if (ticket.startsAt && now < ticket.startsAt) {
          throw ApiError.badRequest(`Early bird sales for ${ticket.name} have not started yet.`);
        }
        if (ticket.endsAt && now > ticket.endsAt) {
          throw ApiError.badRequest(`Early bird sales for ${ticket.name} have ended.`);
        }
      }

      // Group size limits
      if (ticket.isGroup) {
        if (ticket.minGroupSize && item.quantity < ticket.minGroupSize) {
          throw ApiError.badRequest(
            `Ticket ${ticket.name} requires a minimum of ${ticket.minGroupSize} tickets per group.`
          );
        }
        if (ticket.maxGroupSize && item.quantity > ticket.maxGroupSize) {
          throw ApiError.badRequest(
            `Ticket ${ticket.name} allows a maximum of ${ticket.maxGroupSize} tickets per group.`
          );
        }
      }

      // Friendly pre-check (the atomic update below is what actually protects inventory).
      const available = ticket.quantity - ticket.sold;
      if (item.quantity > available) {
        throw ApiError.badRequest(
          `Not enough tickets available for ${ticket.name}. Only ${Math.max(available, 0)} left.`
        );
      }

      // OVERSELLING PROTECTION: claim the tickets in ONE conditional UPDATE.
      // Postgres re-checks the WHERE clause under the row lock, so if another
      // buyer took the last tickets first, this matches zero rows.
      const claimed = await tx.ticketType.updateMany({
        where: {
          id: ticket.id,
          isActive: true,
          sold: { lte: ticket.quantity - item.quantity },
        },
        data: { sold: { increment: item.quantity } },
      });

      if (claimed.count === 0) {
        throw ApiError.badRequest(`Sorry, ${ticket.name} just sold out or doesn't have enough left.`);
      }

      const subtotalCents = ticket.priceCents * item.quantity;
      totalCents += subtotalCents;

      orderItemsData.push({
        ticketTypeId: ticket.id,
        quantity: item.quantity,
        unitPriceCents: ticket.priceCents,
        subtotalCents,
      });
    }

    return await tx.order.create({
      data: {
        reference: `ORD-${randomBytes(5).toString("hex").toUpperCase()}`,
        userId,
        status: "PENDING", // Paid later via Stripe/M-Pesa
        totalCents,
        currency: currency ?? "USD",
        reservationExpiresAt: new Date(now.getTime() + ORDER_HOLD_MINUTES * 60 * 1000),
        items: { create: orderItemsData },
      },
      include: {
        items: { include: { ticketType: true } },
      },
    });
  });
}

export async function getUserOrders(userId: string) {
  return await prisma.order.findMany({
    where: { userId },
    include: { items: { include: { ticketType: { include: { event: true } } } } },
    orderBy: { createdAt: "desc" },
  });
}

// Expires unpaid orders past their hold window and returns their tickets to stock.
// Called on a timer from server.ts. Returns how many orders were released.
export async function releaseExpiredOrders(): Promise<number> {
  const now = new Date();
  const legacyCutoff = new Date(now.getTime() - ORDER_HOLD_MINUTES * 60 * 1000);

  const stale = await prisma.order.findMany({
    where: {
      status: { in: ["PENDING", "RESERVED"] },
      OR: [
        { reservationExpiresAt: { lt: now } },
        // Orders created before reservationExpiresAt existed
        { reservationExpiresAt: null, createdAt: { lt: legacyCutoff } },
      ],
    },
    select: { id: true },
    take: 100,
  });

  let released = 0;

  for (const { id } of stale) {
    await prisma.$transaction(async (tx) => {
      // Only expire if it is STILL unpaid (a payment may have landed meanwhile).
      const flipped = await tx.order.updateMany({
        where: { id, status: { in: ["PENDING", "RESERVED"] } },
        data: { status: "EXPIRED" },
      });
      if (flipped.count === 0) return;

      const order = await tx.order.findUnique({ where: { id }, include: { items: true } });
      if (!order) return;

      for (const it of order.items) {
        await tx.ticketType.update({
          where: { id: it.ticketTypeId },
          data: { sold: { decrement: it.quantity } },
        });
      }
      released++;
    });
  }

  return released;
}
// ==========================================
// END OF FILE: backend/src/modules/orders/orders.service.ts
// ==========================================