// ==========================================
// FILE: backend/src/modules/payments/payments.service.ts
// PURPOSE: Handles payment initialization and webhooks.
// ==========================================
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { logger } from "../../utils/logger";

export interface WebhookInput {
  reference: string;
  status: "SUCCEEDED" | "FAILED";
  provider: "STRIPE" | "MPESA";
  providerRef: string;
  amountCents: number;
  currency: string;
}

export type WebhookResult = "processed" | "duplicate" | "needs_refund" | "failed_recorded";

// Internal signals used to steer the transaction logic.
class StockUnavailableError extends Error {}
class StatusChangedError extends Error {}

export async function initializePayment(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });

  // Same message for "missing" and "not yours" so order ids can't be probed.
  if (!order || order.userId !== userId) throw ApiError.notFound("Order not found");
  if (order.status === "PAID") throw ApiError.badRequest("Order is already paid");
  if (order.status !== "PENDING" && order.status !== "RESERVED") {
    throw ApiError.badRequest(`This order is ${order.status.toLowerCase()} and can no longer be paid`);
  }
  if (order.reservationExpiresAt && order.reservationExpiresAt < new Date()) {
    throw ApiError.badRequest("Your reservation has expired. Please create a new order.");
  }

  // In a real app, this is where you call Stripe or M-Pesa.
  // For now, we return a mock payment intent.
  return {
    clientSecret: `mock_secret_${order.reference}`,
    amount: order.totalCents,
    currency: order.currency,
    expiresAt: order.reservationExpiresAt,
  };
}

function recordPayment(
  orderId: string,
  input: WebhookInput,
  status: "SUCCEEDED" | "FAILED",
  metadata?: Prisma.InputJsonValue
) {
  return prisma.payment.create({
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
}

export async function handleWebhook(input: WebhookInput): Promise<WebhookResult> {
  // A concurrent status change (e.g. the expiry job) can invalidate one attempt; retry a few times.
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await processWebhook(input);
    if (result !== "retry") return result;
  }
  throw ApiError.badRequest("Order is being updated, please retry the webhook");
}

async function processWebhook(input: WebhookInput): Promise<WebhookResult | "retry"> {
  // Idempotency: same provider event already recorded -> do nothing.
  const seen = await prisma.payment.findFirst({
    where: { provider: input.provider, providerRef: input.providerRef, status: input.status },
    select: { id: true },
  });
  if (seen) return "duplicate";

  const order = await prisma.order.findUnique({
    where: { reference: input.reference },
    include: { items: true },
  });
  if (!order) throw ApiError.notFound("Order not found");

  // ---------- FAILED ----------
  if (input.status === "FAILED") {
    // Keep the order open so the buyer can retry until the hold expires.
    await recordPayment(order.id, input, "FAILED");
    return "failed_recorded";
  }

  // ---------- SUCCEEDED ----------
  if (
    input.amountCents !== order.totalCents ||
    input.currency.toUpperCase() !== order.currency.toUpperCase()
  ) {
    logger.error(
      `Webhook amount mismatch for ${order.reference}: got ${input.amountCents} ${input.currency}, expected ${order.totalCents} ${order.currency}`
    );
    throw ApiError.badRequest("Payment amount or currency does not match the order");
  }

  // Money arrived for an order that is already settled -> double charge, flag it.
  if (order.status === "PAID" || order.status === "REFUNDED") {
    await recordPayment(order.id, input, "SUCCEEDED", {
      needsRefund: true,
      reason: "order_already_settled",
    });
    logger.warn(`Duplicate charge on ${order.reference}. Needs refund (${input.providerRef}).`);
    return "needs_refund";
  }

  const fromStatus = order.status; // exact status we read; the transition below is guarded on it
  const wasReleased = fromStatus === "CANCELLED" || fromStatus === "EXPIRED";

  try {
    await prisma.$transaction(async (tx) => {
      // If the hold was released, the stock may have been resold. Re-claim it atomically.
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

      // Guarded transition: only succeeds if the status is still what we read.
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
    });

    return "processed";
  } catch (err) {
    if (err instanceof StatusChangedError) return "retry";

    if (err instanceof StockUnavailableError) {
      // Customer paid but the tickets are gone. Keep the money trail and flag for refund.
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
// ==========================================