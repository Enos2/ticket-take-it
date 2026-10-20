// ==========================================
// FILE: backend/src/modules/orders/orders.service.ts
// PURPOSE: Core purchase logic. Enforces Early-Bird/Group rules and prevents overselling.
// ==========================================
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { CreateOrderInput } from "./orders.schema";
import { randomBytes } from "crypto";

export async function createOrder(userId: string, input: CreateOrderInput) {
  // We use a Prisma Transaction ($transaction) to lock the rows.
  // If ANY item in the order fails validation (sold out, wrong date, group size wrong),
  // the ENTIRE order rolls back automatically. No money lost.
  return await prisma.$transaction(async (tx) => {
    let totalCents = 0;
    const orderItemsData = [];
    const now = new Date();

    for (const item of input.items) {
      // 1. Fetch the ticket type
      const ticket = await tx.ticketType.findUnique({
        where: { id: item.ticketTypeId },
      });

      if (!ticket) throw ApiError.notFound(`Ticket type ${item.ticketTypeId} not found`);
      if (!ticket.isActive) throw ApiError.badRequest(`Ticket ${ticket.name} is no longer active`);

      // 2. Enforce Early Bird Dates (if applicable)
      if (ticket.tier === "EARLY_BIRD") {
        if (ticket.startsAt && now < ticket.startsAt) {
          throw ApiError.badRequest(`Early bird sales for ${ticket.name} have not started yet.`);
        }
        if (ticket.endsAt && now > ticket.endsAt) {
          throw ApiError.badRequest(`Early bird sales for ${ticket.name} have ended.`);
        }
      }

      // 3. Enforce Group Size Limits (if applicable)
      if (ticket.isGroup) {
        if (ticket.minGroupSize && item.quantity < ticket.minGroupSize) {
          throw ApiError.badRequest(`Ticket ${ticket.name} requires a minimum of ${ticket.minGroupSize} tickets per group.`);
        }
        if (ticket.maxGroupSize && item.quantity > ticket.maxGroupSize) {
          throw ApiError.badRequest(`Ticket ${ticket.name} allows a maximum of ${ticket.maxGroupSize} tickets per group.`);
        }
      }

      // 4. Check Availability (Overselling protection)
      const available = ticket.quantity - ticket.sold;
      if (item.quantity > available) {
        throw ApiError.badRequest(`Not enough tickets available for ${ticket.name}. Only ${available} left.`);
      }

      // 5. Increment the "sold" counter
      await tx.ticketType.update({
        where: { id: ticket.id },
        data: { sold: { increment: item.quantity } },
      });

      // 6. Calculate totals
      const subtotalCents = ticket.priceCents * item.quantity;
      totalCents += subtotalCents;

      orderItemsData.push({
        ticketTypeId: ticket.id,
        quantity: item.quantity,
        unitPriceCents: ticket.priceCents,
        subtotalCents,
      });
    }

    // 7. Create the Order
    return await tx.order.create({
      data: {
        reference: `ORD-${randomBytes(4).toString("hex").toUpperCase()}`,
        userId,
        status: "PENDING", // User will pay later via Stripe/M-Pesa
        totalCents,
        items: {
          create: orderItemsData,
        },
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
// ==========================================
// END OF FILE: backend/src/modules/orders/orders.service.ts
// LOCATION: backend/src/modules/orders/orders.service.ts
// LAST UPDATED: October 19, 2026
// ==========================================