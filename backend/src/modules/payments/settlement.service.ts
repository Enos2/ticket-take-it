// ==========================================
// FILE: backend/src/modules/payments/settlement.service.ts
// PURPOSE: The single place where a confirmed payment turns an order into PAID with tickets.
// ==========================================
import { Prisma, PaymentProvider, PaymentStatus } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { background } from "../../utils/background";
import { toJsonObject } from "../../utils/json";
import { logger } from "../../utils/logger";
import { issueTicketsForOrder } from "../orders/fulfillment.service";
import { notifyOrderPaid } from "../notifications/notifications.service";

export interface WebhookInput {
  reference: string; // order reference
  status: "SUCCEEDED" | "FAILED";
  provider: PaymentProvider;
  providerRef: string; // the provider's id for this payment attempt (idempotency key)
  amountCents: number;
  currency: string;
  metadata?: Prisma.InputJsonObject;
}

export type WebhookResult = "processed" | "duplicate" | "needs_refund" | "failed_recorded";

// Internal signals used to steer the transaction logic.
class StockUnavailableError extends Error {}
class StatusChangedError extends Error {}

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

type Db = Prisma.TransactionClient;

// Turns the PENDING row created at initialization into the final one, or creates the row if there is none.
async function settlePayment(
  db: Db,
  orderId: string,
  input: WebhookInput,
  status: "SUCCEEDED" | "FAILED",
  extra?: Prisma.InputJsonObject
) {
  const currency = input.currency.toUpperCase();

  const pending = await db.payment.findFirst({
    where: { orderId, provider: input.provider, providerRef: input.providerRef, status: "PENDING" },
  });

  if (pending) {
    const claimed = await db.payment.updateMany({
      where: { id: pending.id, status: "PENDING" },
      data: {
        status,
        amountCents: input.amountCents,
        currency,
        metadata: { ...toJsonObject(pending.metadata), ...input.metadata, ...extra },
      },
    });
    if (claimed.count > 0) return;
  }

  await db.payment.create({
    data: {
      orderId,
      provider: input.provider,
      providerRef: input.providerRef,
      status,
      amountCents: input.amountCents,
      currency,
      metadata: { ...input.metadata, ...extra },
    },
  });
}

// Records a payment outside a transaction.
// Returns false when the unique index says this exact event was already recorded (a duplicate).
async function recordPayment(
  orderId: string,
  input: WebhookInput,
  status: "SUCCEEDED" | "FAILED",
  extra?: Prisma.InputJsonObject
): Promise<boolean> {
  try {
    await settlePayment(prisma, orderId, input, status, extra);
    return true;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return false;
  }
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
  // A refunded payment still counts as "seen" so a replay can't resurrect it.
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

  // ---------- FAILED ----------
  if (input.status === "FAILED") {
    // Keep the order open so the buyer can retry until the hold expires.
    const created = await recordPayment(order.id, input, "FAILED");
    return created ? "failed_recorded" : "duplicate";
  }

  // ---------- SUCCEEDED ----------
  // Real money arrived. Never throw it away: if anything doesn't add up, record it for a refund.
  if (
    input.amountCents !== order.totalCents ||
    input.currency.toUpperCase() !== order.currency.toUpperCase()
  ) {
    logger.error(
      `Payment amount mismatch for ${order.reference}: got ${input.amountCents} ${input.currency}, expected ${order.totalCents} ${order.currency}`
    );
    const created = await recordPayment(order.id, input, "SUCCEEDED", {
      needsRefund: true,
      reason: "amount_mismatch",
      expectedCents: order.totalCents,
    });
    return created ? "needs_refund" : "duplicate";
  }

  // Money arrived for an order that is already settled -> double charge, flag it.
  if (order.status === "PAID" || order.status === "REFUNDED") {
    const created = await recordPayment(order.id, input, "SUCCEEDED", {
      needsRefund: true,
      reason: "order_already_settled",
    });
    if (!created) return "duplicate";
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
            where: { id: ticket.id, isActive: true, sold: { lte: ticket.quantity - it.quantity } },
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

      await settlePayment(tx, order.id, input, "SUCCEEDED");

      // Same transaction: the order is never PAID without its tickets.
      await issueTicketsForOrder(tx, order.id);
    });

    background(notifyOrderPaid(order.id), "order confirmation email");
    return "processed";
  } catch (err) {
    if (err instanceof StatusChangedError) return "retry";

    // The unique index caught the same event arriving twice at once. The whole transaction rolled back.
    if (isUniqueViolation(err)) return "duplicate";

    if (err instanceof StockUnavailableError) {
      // Customer paid but the tickets are gone. Keep the money trail and flag for refund.
      const created = await recordPayment(order.id, input, "SUCCEEDED", {
        needsRefund: true,
        reason: "stock_unavailable_after_expiry",
      });
      if (!created) return "duplicate";
      logger.warn(`Late payment on ${order.reference} but stock is gone. Needs refund (${input.providerRef}).`);
      return "needs_refund";
    }

    throw err;
  }
}
// ==========================================
// END OF FILE: backend/src/modules/payments/settlement.service.ts
// ==========================================