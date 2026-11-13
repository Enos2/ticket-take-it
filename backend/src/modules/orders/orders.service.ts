// ==========================================
// FILE: backend/src/modules/orders/orders.service.ts
// PURPOSE: Core purchase logic. Enforces Early-Bird/Group rules, event capacity, held-back tickets and seat holds, and prevents overselling.
// ==========================================
import { randomBytes } from "crypto";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { background } from "../../utils/background";
import { notifyOrderPaid } from "../notifications/notifications.service";
import {
  capacityRoom,
  claimStock,
  lockCapacityEvents,
  reservedRemaining,
  syncSoldOutForTicketTypes,
  syncSoldOutSafely,
} from "../events/capacity.service";
import { holdSeats, releaseOrderSeats } from "../seating/seatHolds";
import { CreateOrderInput } from "./orders.schema";
import { issueTicketsForOrder } from "./fulfillment.service";

// How long an unpaid order holds its tickets and seats before they are released.
export const ORDER_HOLD_MINUTES = 15;

interface OrderItemData {
  ticketTypeId: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
}

// The seat a ticket sits in, for the ticket list and the order page.
const seatSelect = { select: { row: true, number: true, section: { select: { name: true } } } } as const;

// What the API returns for a single order.
const orderInclude = {
  items: { include: { ticketType: true } },
  tickets: { select: { id: true, code: true, status: true, ticketTypeId: true, seat: seatSelect } },
} satisfies Prisma.OrderInclude;

// Returns stock to inventory. Sorted so concurrent releases can't deadlock.
// Afterwards a SOLD_OUT event that has stock again goes back on sale.
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
  await syncSoldOutForTicketTypes(tx, sorted.map((it) => it.ticketTypeId));
}

async function createOrderInternal(userId: string, input: CreateOrderInput) {
  const seatIds = [...new Set(input.seatIds)].sort();

  // If ANY item fails (sold out, wrong date, bad group size, a seat just taken), the whole order rolls back.
  return await prisma.$transaction(async (tx) => {
    let totalCents = 0;
    let currency: string | null = null;
    const orderItemsData: OrderItemData[] = [];
    const now = new Date();

    // 1. Merge duplicate lines so the same ticket can't be split to dodge group limits.
    const merged = new Map<string, number>();
    for (const { ticketTypeId, quantity } of input.items) {
      merged.set(ticketTypeId, (merged.get(ticketTypeId) ?? 0) + quantity);
    }

    // 2. A seated ticket type can only be bought by choosing seats.
    if (input.items.length > 0) {
      const seated = await tx.seatSection.findFirst({
        where: { ticketTypeId: { in: input.items.map((i) => i.ticketTypeId) } },
        select: { id: true },
      });
      if (seated) throw ApiError.badRequest("This ticket has assigned seats. Pick your seats on the seat map.");
    }

    // 3. Every seat counts as one ticket of its section's ticket type.
    if (seatIds.length > 0) {
      const seats = await tx.seat.findMany({
        where: { id: { in: seatIds } },
        select: { id: true, section: { select: { ticketTypeId: true } } },
      });
      if (seats.length !== seatIds.length) throw ApiError.notFound("One of the seats you picked does not exist");
      for (const seat of seats) {
        merged.set(seat.section.ticketTypeId, (merged.get(seat.section.ticketTypeId) ?? 0) + 1);
      }
    }

    // 4. Always process tickets in the same order so concurrent orders can't deadlock.
    const items = [...merged.entries()]
      .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }))
      .sort((a, b) => (a.ticketTypeId < b.ticketTypeId ? -1 : 1));

    // Events with a capacity limit are locked first, in a fixed order,
    // so two buyers can never both take the last spots of the event.
    await lockCapacityEvents(
      tx,
      items.map((i) => i.ticketTypeId)
    );

    for (const item of items) {
      const ticket = await tx.ticketType.findUnique({
        where: { id: item.ticketTypeId },
        include: { event: { include: { seller: { select: { status: true } } } } },
      });

      if (!ticket) throw ApiError.notFound(`Ticket type ${item.ticketTypeId} not found`);
      if (!ticket.isActive) throw ApiError.badRequest(`Ticket ${ticket.name} is no longer active`);

      // One order, one currency.
      if (currency === null) {
        currency = ticket.currency;
      } else if (ticket.currency !== currency) {
        throw ApiError.badRequest("All tickets in one order must use the same currency");
      }

      // Event must be on sale and not finished. A SOLD_OUT event is checked against its real stock below,
      // because its status can lag behind for a moment after tickets are released.
      const onSale = ticket.event.status === "PUBLISHED" || ticket.event.status === "SOLD_OUT";
      if (!onSale || ticket.event.endsAt < now) {
        throw ApiError.badRequest(`Tickets for ${ticket.event.title} are no longer on sale`);
      }

      // A suspended or rejected seller can't sell.
      if (ticket.event.seller.status !== "APPROVED") {
        throw ApiError.badRequest(`Tickets for ${ticket.event.title} are not available right now`);
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
      // Tickets held back for the seller are not for sale, and the event capacity caps every type together.
      let available = ticket.quantity - ticket.sold - reservedRemaining(ticket);
      if (ticket.event.maxCapacity !== null) {
        available = Math.min(available, await capacityRoom(tx, ticket.eventId, ticket.event.maxCapacity));
      }
      if (item.quantity > available) {
        throw ApiError.badRequest(
          `Not enough tickets available for ${ticket.name}. Only ${Math.max(available, 0)} left.`
        );
      }

      // OVERSELLING PROTECTION: claim the tickets in ONE conditional UPDATE.
      // Postgres re-checks the WHERE clause under the row lock, so if another
      // buyer took the last tickets first, this matches zero rows.
      const claimed = await claimStock(tx, ticket.id, item.quantity);
      if (!claimed) {
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

    // Free orders skip payment: they are paid immediately and tickets are issued now.
    const isFree = totalCents === 0;

    const order = await tx.order.create({
      data: {
        reference: `ORD-${randomBytes(5).toString("hex").toUpperCase()}`,
        userId,
        status: isFree ? "PAID" : "PENDING",
        totalCents,
        currency: currency ?? "KES",
        paidAt: isFree ? now : null,
        reservationExpiresAt: isFree ? null : new Date(now.getTime() + ORDER_HOLD_MINUTES * 60 * 1000),
        items: { create: orderItemsData },
      },
    });

    // Hold the chosen seats. Each seat is claimed in ONE conditional UPDATE, so only one buyer can get it.
    if (seatIds.length > 0) {
      await tx.orderSeat.createMany({ data: seatIds.map((seatId) => ({ orderId: order.id, seatId })) });

      const until = order.reservationExpiresAt ?? new Date(now.getTime() + ORDER_HOLD_MINUTES * 60 * 1000);
      const taken = await holdSeats(tx, order.id, seatIds, until);
      if (taken.length > 0) {
        throw ApiError.badRequest("Some of the seats you picked were just taken. Please choose different seats.");
      }
    }

    if (isFree) await issueTicketsForOrder(tx, order.id);

    return await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  });
}

export async function createOrder(userId: string, input: CreateOrderInput) {
  const order = await createOrderInternal(userId, input);

  // After the purchase is committed, mark the event SOLD_OUT if that was the last stock.
  // Done here (not inside the transaction) so it also sees purchases that finished at the same moment.
  await syncSoldOutSafely(order.items.map((i) => i.ticketTypeId));

  // Free orders are paid instantly, so their confirmation goes out now. Paid orders email from the payment flow.
  if (order.status === "PAID") background(notifyOrderPaid(order.id), "order confirmation email");
  return order;
}

export async function getUserOrders(userId: string) {
  return await prisma.order.findMany({
    where: { userId },
    include: {
      items: { include: { ticketType: { include: { event: true } } } },
      // Only tickets the person still holds. A ticket they transferred away is not theirs to see.
      tickets: { where: { userId }, select: { id: true, code: true, status: true, ticketTypeId: true, seat: seatSelect } },
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
      tickets: { select: { id: true, code: true, status: true, ticketTypeId: true, userId: true, seat: seatSelect } },
    },
  });
  // Same error for "missing" and "not yours" so order ids can't be probed.
  if (!order || (order.userId !== userId && role !== "ADMIN")) throw ApiError.notFound("Order not found");

  // The buyer must not see the new code of a ticket they transferred away. Admins see everything.
  const visible = role === "ADMIN" ? order.tickets : order.tickets.filter((t) => t.userId === userId);

  return {
    ...order,
    tickets: visible.map((t) => ({ id: t.id, code: t.code, status: t.status, ticketTypeId: t.ticketTypeId, seat: t.seat })),
  };
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
      transferCount: true,
      seat: seatSelect,
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

// Lets a buyer give up an unpaid order, returning its tickets and seats straight away.
export async function cancelOrder(userId: string, orderId: string) {
  return await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order || order.userId !== userId) throw ApiError.notFound("Order not found");
    if (order.status !== "PENDING" && order.status !== "RESERVED") {
      throw ApiError.badRequest("Only unpaid orders can be cancelled");
    }

    // Guarded: if a payment landed or the expiry job ran meanwhile, this matches nothing.
    const flipped = await tx.order.updateMany({
      where: { id: orderId, status: { in: ["PENDING", "RESERVED"] } },
      data: { status: "CANCELLED" },
    });
    if (flipped.count === 0) throw ApiError.conflict("The order changed while cancelling. Please refresh.");

    await releaseStock(tx, order.items);
    await releaseOrderSeats(tx, orderId);

    return await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
  });
}

// Expires unpaid orders past their hold window and returns their tickets and seats.
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

      await releaseStock(tx, order.items);
      await releaseOrderSeats(tx, id);
      released++;
    });
  }

  return released;
}
// ==========================================
// END OF FILE: backend/src/modules/orders/orders.service.ts
// ==========================================