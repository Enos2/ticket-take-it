// ==========================================
// FILE: backend/src/modules/payments/refund.service.ts
// PURPOSE: Order refunds and the "needs refund" payment queue.
// ==========================================
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { logger } from "../../utils/logger";
import { skipTake, Pagination } from "../../utils/pagination";
import { releaseStock } from "../orders/orders.service";
import { background } from "../../utils/background";
import { notifyOrderRefunded } from "../notifications/notifications.service";

function asObject(value: Prisma.JsonValue | null): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Prisma.JsonObject) : {};
}

const isFlagged = (value: Prisma.JsonValue | null) => asObject(value).needsRefund === true;

export async function refundOrder(adminId: string, orderId: string, reason?: string) {
  const { order, refundable } = await prisma.$transaction(async (tx) => {
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

    const flipped = await tx.order.updateMany({
      where: { id: orderId, status: "PAID" },
      data: { status: "REFUNDED", refundedAt: now },
    });
    if (flipped.count === 0) throw ApiError.conflict("The order changed while refunding. Please refresh.");

    await tx.ticket.updateMany({ where: { orderId, status: "VALID" }, data: { status: "VOID" } });
    await releaseStock(tx, found.items);

    const refundable = found.payments.filter((p) => p.status === "SUCCEEDED" && !isFlagged(p.metadata));

    for (const p of refundable) {
      await tx.payment.update({
        where: { id: p.id },
        data: {
          status: "REFUNDED",
          metadata: {
            ...asObject(p.metadata),
            refundedAt: now.toISOString(),
            refundedBy: adminId,
            reason: reason ?? null,
          },
        },
      });
    }

    return { order: found, refundable };
  });

  logger.info(`Order ${order.reference} refunded by admin ${adminId}`);
  background(notifyOrderRefunded(order.id), "refund email");

  return {
    orderId: order.id,
    reference: order.reference,
    status: "REFUNDED" as const,
    manualRefundRequired: refundable.length > 0,
    payments: refundable.map((p) => ({
      provider: p.provider,
      providerRef: p.providerRef,
      amountCents: p.amountCents,
      currency: p.currency,
    })),
  };
}

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
          select: { reference: true, user: { select: { email: true, fullName: true, phone: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
      ...skipTake(pagination),
    }),
    prisma.payment.count({ where }),
  ]);

  return { items, total, page: pagination.page, limit: pagination.limit };
}

export async function resolveRefundPayment(adminId: string, paymentId: string, note?: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || !isFlagged(payment.metadata)) throw ApiError.notFound("No pending refund found for this payment");
  if (payment.status !== "SUCCEEDED") throw ApiError.conflict("This payment was already resolved");

  const updated = await prisma.payment.updateMany({
    where: { id: paymentId, status: "SUCCEEDED" },
    data: {
      status: "REFUNDED",
      metadata: {
        ...asObject(payment.metadata),
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
// LOCATION: backend/src/modules/payments/refund.service.ts
// LAST UPDATED: October 22, 2026
// ==========================================