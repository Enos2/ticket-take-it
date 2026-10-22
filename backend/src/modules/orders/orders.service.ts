// ==========================================
// FILE: backend/src/modules/orders/orders.service.ts
// PURPOSE: Core purchase logic. Enforces Early-Bird/Group rules and prevents overselling.
// ==========================================
import { randomBytes } from "crypto";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { CreateOrderInput } from "./orders.schema";
import { issueTicketsForOrder } from "./fulfillment.service";
import { background } from "../../utils/background";
import { notifyOrderPaid } from "../notifications/notifications.service";

export const ORDER_HOLD_MINUTES = 15;

interface OrderItemData {
  ticketTypeId: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
}

const orderInclude = {
  items: { include: { ticketType: true } },
  tickets: { select: { id: true, code: true, status: true, ticketTypeId: true } },
} satisfies Prisma.OrderInclude;

export async function releaseStock(
  tx: Prisma.TransactionClient,
  items: { ticketTypeId: string; quantity: number }[]
) {
  const sorted = [...items].sort((a, b) => (a.ticketTypeId < b.ticketTypeId ? -1 : 1));
  for (const it of sorted) {
    await tx.ticketType.update({
      where: { id: it.ticketTypeId },
      data: { sold: { decrement: it.quantity } },
    });
  }
}

export async function createOrder(userId: string, input: CreateOrderInput) {
  const order = await createOrderInternal(userId, input);
  if (order.status === "PAID") background(notifyOrderPaid(order.id), "order confirmation email");
  return order;
}

async function createOrderInternal(userId: string, input: CreateOrderInput) {
  const merged = new Map<string, number>();
  for (const { ticketTypeId, quantity } of input.items) {
    merged.set(ticketTypeId, (merged.get(ticketTypeId) ?? 0) + quantity);
  }

  const items = [...merged.entries()]
    .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }))
    .sort((a, b) => (a.ticketTypeId < b.ticketTypeId ? -1 : 1));

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

      if (currency === null) {
        currency = ticket.currency;
      } else if (ticket.currency !== currency) {
        throw ApiError.badRequest("All tickets in one order must use the same currency");
      }

      if (ticket.event.status !== "PUBLISHED" || ticket.event.endsAt < now) {
        throw ApiError.badRequest(`Tickets for ${ticket.event.title} are no longer on sale`);
      }

      if (ticket.tier === "EARLY_BIRD") {
        if (ticket.startsAt && now < ticket.startsAt) {
          throw ApiError.badRequest(`Early bird sales for ${ticket.name} have not started yet.`);
        }
        if (ticket.endsAt && now > ticket.endsAt) {
          throw ApiError.badRequest(`Early bird sales for ${ticket.name} have ended.`);
        }
      }

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

      const available = ticket.quantity - ticket.sold;
      if (item.quantity > available) {
        throw ApiError.badRequest(
          `Not enough tickets available for ${ticket.name}. Only ${Math.max(available, 0)} left.`
        );
      }

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

    const isFree = totalCents === 0;

    const order = await tx.order.create({
      data: {
        reference: `ORD-${randomBytes(5).toString("hex").toUpperCase()}`,
        userId,
        status: isFree ? "PAID" : "PENDING",
        totalCents,
        currency: currency ?? "USD",
        paidAt: isFree ? now : null,
        reservationExpiresAt: isFree ? null : new Date(now.getTime() + ORDER_HOLD_MINUTES * 60 * 1000),
        items: { create: orderItemsData },
      },
    });

    if (isFree) await issueTicketsForOrder(tx, order.id);

    return await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  });
}

export async function getUserOrders(userId: string) {
  return await prisma.order.findMany({
    where: { userId },
    include: {
      items: { include: { ticketType: { include: { event: true } } } },
      tickets: { select: { id: true, code: true, status: true, ticketTypeId: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function getOrderById(userId: string, role: Role, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { ticketType: { include: { event: true } } } },
      tickets: { select: { id: true, code: true, status: true, ticketTypeId: true } },
    },
  });
  if (!order || (order.userId !== userId && role !== "ADMIN")) throw ApiError.notFound("Order not found");
  return order;
}

export async function getUserTickets(userId: string) {
  return await prisma.ticket.findMany({
    where: { userId },
    select: {
      id: true,
      code: true,
      status: true,
      usedAt: true,
      createdAt: true,
      ticketType: { select: { name: true, tier: true } },
      event: {
        select: { id: true, title: true, slug: true, venue: true, city: true, startsAt: true, endsAt: true, status: true },
      },
      order: { select: { reference: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function cancelOrder(userId: string, orderId: string) {
  return await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order || order.userId !== userId) throw ApiError.notFound("Order not found");
    if (order.status !== "PENDING" && order.status !== "RESERVED") {
      throw ApiError.badRequest("Only unpaid orders can be cancelled");
    }

    const flipped = await tx.order.updateMany({
      where: { id: orderId, status: { in: ["PENDING", "RESERVED"] } },
      data: { status: "CANCELLED" },
    });
    if (flipped.count === 0) throw ApiError.conflict("The order changed while cancelling. Please refresh.");

    await releaseStock(tx, order.items);

    return await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
  });
}

export async function releaseExpiredOrders(): Promise<number> {
  const now = new Date();
  const legacyCutoff = new Date(now.getTime() - ORDER_HOLD_MINUTES * 60 * 1000);

  const stale = await prisma.order.findMany({
    where: {
      status: { in: ["PENDING", "RESERVED"] },
      OR: [
        { reservationExpiresAt: { lt: now } },
        { reservationExpiresAt: null, createdAt: { lt: legacyCutoff } },
      ],
    },
    select: { id: true },
    take: 100,
  });

  let released = 0;

  for (const { id } of stale) {
    await prisma.$transaction(async (tx) => {
      const flipped = await tx.order.updateMany({
        where: { id, status: { in: ["PENDING", "RESERVED"] } },
        data: { status: "EXPIRED" },
      });
      if (flipped.count === 0) return;

      const order = await tx.order.findUnique({ where: { id }, include: { items: true } });
      if (!order) return;

      await releaseStock(tx, order.items);
      released++;
    });
  }

  return released;
}
// ==========================================
// END OF FILE: backend/src/modules/orders/orders.service.ts
// LOCATION: backend/src/modules/orders/orders.service.ts
// LAST UPDATED: October 22, 2026
// ==========================================