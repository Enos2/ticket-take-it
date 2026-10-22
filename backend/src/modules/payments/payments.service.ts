// ==========================================
// FILE: backend/src/modules/payments/payments.service.ts
// PURPOSE: Handles payment initialization and webhooks.
// ==========================================
import { Prisma, PaymentStatus } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { logger } from "../../utils/logger";
import { issueTicketsForOrder } from "../orders/fulfillment.service";
import { background } from "../../utils/background";
import { notifyOrderPaid } from "../notifications/notifications.service";

export interface WebhookInput {
  reference: string;
  status: "SUCCEEDED" | "FAILED";
  provider: "STRIPE" | "MPESA";
  providerRef: string;
  amountCents: number;
  currency: string;
}

export type WebhookResult = "processed" | "duplicate" | "needs_refund" | "failed_recorded";

class StockUnavailableError extends Error {}
class StatusChangedError extends Error {}

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

export async function initializePayment(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });

  if (!order || order.userId !== userId) throw ApiError.notFound("Order not found");
  if (order.status === "PAID") throw ApiError.badRequest("Order is already paid");
  if (order.status !== "PENDING" && order.status !== "RESERVED") {
    throw ApiError.badRequest(`This order is ${order.status.toLowerCase()} and can no longer be paid`);
  }
  if (order.reservationExpiresAt && order.reservationExpiresAt < new Date()) {
    throw ApiError.badRequest("Your reservation has expired. Please create a new order.");
  }

  return {
    clientSecret: `mock_secret_${order.reference}`,
    amount: order.totalCents,
    currency: order.currency,
    expiresAt: order.reservationExpiresAt,
  };
}

async function recordPayment(
  orderId: string,
  input: WebhookInput,
  status: "SUCCEEDED" | "FAILED",
  metadata?: Prisma.InputJsonValue
) {
  try {
    await prisma.payment.create({
      data: {
        orderId,
        provider: input.provider,
        providerRef: input.providerRef,
        status,
        amountCents: input.amountCents,
        currency: input.currency.toUpperCase(),
        metadata,
      },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }
}

export async function handleWebhook(input: WebhookInput): Promise<WebhookResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await processWebhook(input);
    if (result !== "retry") return result;
  }
  throw ApiError.badRequest("Order is being updated, please retry the webhook");
}

async function processWebhook(input: WebhookInput): Promise<WebhookResult | "retry"> {
  const seenStatuses: PaymentStatus[] = input.status === "SUCCEEDED" ? ["SUCCEEDED", "REFUNDED"] : ["FAILED"];
  const seen = await prisma.payment.findFirst({
    where: { provider: input.provider, providerRef: input.providerRef, status: { in: seenStatuses } },
    select: { id: true },
  });
  if (seen) return "duplicate";

  const order = await prisma.order.findUnique({
    where: { reference: input.reference },
    include: { items: true },
  });
  if (!order) throw ApiError.notFound("Order not found");

  if (input.status === "FAILED") {
    await recordPayment(order.id, input, "FAILED");
    return "failed_recorded";
  }

  if (
    input.amountCents !== order.totalCents ||
    input.currency.toUpperCase() !== order.currency.toUpperCase()
  ) {
    logger.error(
      `Webhook amount mismatch for ${order.reference}: got ${input.amountCents} ${input.currency}, expected ${order.totalCents} ${order.currency}`
    );
    throw ApiError.badRequest("Payment amount or currency does not match the order");
  }

  if (order.status === "PAID" || order.status === "REFUNDED") {
    await recordPayment(order.id, input, "SUCCEEDED", {
      needsRefund: true,
      reason: "order_already_settled",
    });
    logger.warn(`Duplicate charge on ${order.reference}. Needs refund (${input.providerRef}).`);
    return "needs_refund";
  }

  const fromStatus = order.status; 
  const wasReleased = fromStatus === "CANCELLED" || fromStatus === "EXPIRED";

  try {
    await prisma.$transaction(async (tx) => {
      if (wasReleased) {
        const sorted = [...order.items].sort((a, b) => (a.ticketTypeId < b.ticketTypeId ? -1 : 1));
        for (const it of sorted) {
          const ticket = await tx.ticketType.findUnique({ where: { id: it.ticketTypeId } });
          if (!ticket) throw new StockUnavailableError();

          const claimed = await tx.ticketType.updateMany({
            where: { id: ticket.id, sold: { lte: ticket.quantity - it.quantity } },
            data: { sold: { increment: it.quantity } },
          });
          if (claimed.count === 0) throw new StockUnavailableError();
        }
      }

      const moved = await tx.order.updateMany({
        where: { id: order.id, status: fromStatus },
        data: { status: "PAID", paidAt: new Date() },
      });
      if (moved.count === 0) throw new StatusChangedError();

      await tx.payment.create({
        data: {
          orderId: order.id,
          provider: input.provider,
          providerRef: input.providerRef,
          status: "SUCCEEDED",
          amountCents: input.amountCents,
          currency: input.currency.toUpperCase(),
        },
      });

      await issueTicketsForOrder(tx, order.id);
    });

    background(notifyOrderPaid(order.id), "order confirmation email");
    return "processed";
  } catch (err) {
    if (err instanceof StatusChangedError) return "retry";

    if (isUniqueViolation(err)) return "duplicate";

    if (err instanceof StockUnavailableError) {
      await recordPayment(order.id, input, "SUCCEEDED", {
        needsRefund: true,
        reason: "stock_unavailable_after_expiry",
      });
      logger.warn(`Late payment on ${order.reference} but stock is gone. Needs refund (${input.providerRef}).`);
      return "needs_refund";
    }

    throw err;
  }
}
// ==========================================
// END OF FILE: backend/src/modules/payments/payments.service.ts
// LOCATION: backend/src/modules/payments/payments.service.ts
// LAST UPDATED: October 22, 2026
// ==========================================