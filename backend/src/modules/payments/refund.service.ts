// ==========================================
// FILE: backend/src/modules/payments/refund.service.ts
// PURPOSE: Order refunds and the "needs refund" payment queue.
// ==========================================
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { background } from "../../utils/background";
import { toJsonObject } from "../../utils/json";
import { logger } from "../../utils/logger";
import { skipTake, Pagination } from "../../utils/pagination";
import { releaseStock } from "../orders/orders.service";
import { notifyOrderRefunded } from "../notifications/notifications.service";
import { refundPaystackPayment } from "./paystack.service";

const isFlagged = (value: unknown) => toJsonObject(value).needsRefund === true;

export interface RefundAttempt {
  paymentId: string;
  provider: string;
  providerRef: string | null;
  amountCents: number;
  currency: string;
  outcome: "refunded" | "manual_required" | "failed";
  detail: string | null;
}

// Tries to return one payment's money. Paystack is automatic. Everything else needs a human.
async function attemptProviderRefund(adminId: string, paymentId: string, note?: string): Promise<RefundAttempt> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw ApiError.notFound("Payment not found");

  const base = {
    paymentId: payment.id,
    provider: payment.provider,
    providerRef: payment.providerRef,
    amountCents: payment.amountCents,
    currency: payment.currency,
  };

  if (payment.provider !== "PAYSTACK") {
    return {
      ...base,
      outcome: "manual_required",
      detail:
        payment.provider === "MPESA"
          ? "Return the money through M-Pesa, then mark it resolved."
          : "Return the money by hand, then mark it resolved.",
    };
  }

  try {
    const refund = await refundPaystackPayment(payment, note);

    await prisma.payment.updateMany({
      where: { id: payment.id, status: "SUCCEEDED" },
      data: {
        status: "REFUNDED",
        metadata: {
          ...toJsonObject(payment.metadata),
          needsRefund: false,
          refundId: refund.id,
          refundStatus: refund.status,
          refundedAt: new Date().toISOString(),
          refundedBy: adminId,
        },
      },
    });

    return { ...base, outcome: "refunded", detail: `Paystack refund ${refund.status}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refund failed";
    logger.error({ err }, `Paystack refund failed for payment ${payment.id}`);

    // Stays in the needs-refund queue with the reason, ready to retry.
    await prisma.payment.updateMany({
      where: { id: payment.id, status: "SUCCEEDED" },
      data: { metadata: { ...toJsonObject(payment.metadata), needsRefund: true, lastRefundError: message } },
    });

    return { ...base, outcome: "failed", detail: message };
  }
}

// Voids the order's tickets, returns stock, then returns the money (automatically for Paystack).
export async function refundOrder(adminId: string, orderId: string, reason?: string) {
  const { order, toReturn } = await prisma.$transaction(async (tx) => {
    const found = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true, tickets: { select: { status: true } }, payments: true },
    });
    if (!found) throw ApiError.notFound("Order not found");
    if (found.status !== "PAID") throw ApiError.badRequest("Only paid orders can be refunded");
    if (found.tickets.some((t) => t.status === "USED")) {
      throw ApiError.conflict("Some tickets from this order were already used and cannot be refunded here");
    }

    const now = new Date();

    // Guarded: two admins clicking at once, only one wins.
    const flipped = await tx.order.updateMany({
      where: { id: orderId, status: "PAID" },
      data: { status: "REFUNDED", refundedAt: now },
    });
    if (flipped.count === 0) throw ApiError.conflict("The order changed while refunding. Please refresh.");

    await tx.ticket.updateMany({ where: { orderId, status: "VALID" }, data: { status: "VOID" } });
    await releaseStock(tx, found.items);

    // The genuine payment. Duplicate charges already flagged are handled in the queue separately.
    const toReturn = found.payments.filter((p) => p.status === "SUCCEEDED" && !isFlagged(p.metadata));

    // Flag first, so the money is tracked even if the process dies before the refund call below.
    for (const p of toReturn) {
      await tx.payment.update({
        where: { id: p.id },
        data: {
          metadata: {
            ...toJsonObject(p.metadata),
            needsRefund: true,
            reason: "order_refunded",
            refundNote: reason ?? null,
            refundRequestedBy: adminId,
            refundRequestedAt: now.toISOString(),
          },
        },
      });
    }

    return { order: found, toReturn };
  });

  logger.info(`Order ${order.reference} refunded by admin ${adminId}`);

  const attempts: RefundAttempt[] = [];
  for (const p of toReturn) {
    attempts.push(await attemptProviderRefund(adminId, p.id, reason));
  }

  background(notifyOrderRefunded(order.id), "refund email");

  return {
    orderId: order.id,
    reference: order.reference,
    status: "REFUNDED" as const,
    // True until every payment has been returned.
    manualRefundRequired: attempts.some((a) => a.outcome !== "refunded"),
    payments: attempts,
  };
}

// Tries again for a payment in the queue whose automatic refund failed. Paystack payments only.
export async function retryPaymentRefund(adminId: string, paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.status !== "SUCCEEDED" || !isFlagged(payment.metadata)) {
    throw ApiError.notFound("No pending refund found for this payment");
  }
  if (payment.provider !== "PAYSTACK") {
    throw ApiError.badRequest("Only Paystack payments can be refunded automatically. Return the money by hand, then use resolve-refund.");
  }

  return await attemptProviderRefund(adminId, paymentId);
}

// Refunds every paid order of a CANCELLED event, 25 per call.
// Call again until `refunded` is 0. `needsReview` counts orders that need a human decision
// (tickets already scanned, or the order also contains tickets for another event).
export async function refundEventOrders(adminId: string, eventId: string, reason?: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { status: true } });
  if (!event) throw ApiError.notFound("Event not found");
  if (event.status !== "CANCELLED") throw ApiError.badRequest("Cancel the event before refunding its orders");

  const eligible: Prisma.OrderWhereInput = {
    status: "PAID",
    items: { some: { ticketType: { eventId } }, every: { ticketType: { eventId } } },
    tickets: { none: { status: "USED" } },
  };

  const batch = await prisma.order.findMany({
    where: eligible,
    select: { id: true, reference: true },
    orderBy: { createdAt: "asc" },
    take: 25,
  });

  const failed: { reference: string; error: string }[] = [];
  let refunded = 0;

  for (const o of batch) {
    try {
      await refundOrder(adminId, o.id, reason ?? "Event cancelled");
      refunded++;
    } catch (err) {
      failed.push({ reference: o.reference, error: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  const [remaining, allPaid] = await Promise.all([
    prisma.order.count({ where: eligible }),
    prisma.order.count({ where: { status: "PAID", items: { some: { ticketType: { eventId } } } } }),
  ]);

  return { refunded, failed, remaining, needsReview: allPaid - remaining };
}

// Payments flagged because money must go back to a customer:
// order refunds that need a human, failed automatic refunds, double charges,
// late payments after sell-out, amount mismatches.
export async function listPaymentsNeedingRefund(pagination: Pagination) {
  const where: Prisma.PaymentWhereInput = {
    status: "SUCCEEDED",
    metadata: { path: ["needsRefund"], equals: true },
  };

  const [items, total] = await prisma.$transaction([
    prisma.payment.findMany({
      where,
      include: {
        order: {
          select: {
            reference: true,
            status: true,
            user: { select: { email: true, fullName: true, phone: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      ...skipTake(pagination),
    }),
    prisma.payment.count({ where }),
  ]);

  return { items, total, page: pagination.page, limit: pagination.limit };
}

// Call after the money has been returned by hand. `note` is where the reversal receipt goes.
export async function resolveRefundPayment(adminId: string, paymentId: string, note?: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || !isFlagged(payment.metadata)) throw ApiError.notFound("No pending refund found for this payment");
  if (payment.status !== "SUCCEEDED") throw ApiError.conflict("This payment was already resolved");

  const updated = await prisma.payment.updateMany({
    where: { id: paymentId, status: "SUCCEEDED" },
    data: {
      status: "REFUNDED",
      metadata: {
        ...toJsonObject(payment.metadata),
        needsRefund: false,
        resolvedAt: new Date().toISOString(),
        resolvedBy: adminId,
        note: note ?? null,
      },
    },
  });
  if (updated.count === 0) throw ApiError.conflict("This payment was already resolved");

  logger.info(`Payment ${paymentId} marked refunded by admin ${adminId}`);
  return await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
}
// ==========================================
// END OF FILE: backend/src/modules/payments/refund.service.ts
// ==========================================