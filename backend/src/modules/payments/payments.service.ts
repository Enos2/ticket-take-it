// ==========================================
// FILE: backend/src/modules/payments/payments.service.ts
// PURPOSE: Starts payments with the chosen provider and reports their progress.
// ==========================================
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";
import { toJsonObject } from "../../utils/json";
import { startMpesaPayment } from "./mpesa.service";
import { startPaystackPayment, refreshPendingPaystackPayment } from "./paystack.service";
import type { InitializePaymentInput } from "./payments.schema";

// Tells the frontend which payment buttons to show.
// `paystack` is hosted checkout (cards, plus mobile money if enabled on your Paystack account).
// `mpesa` is the direct M-Pesa prompt sent to the customer's phone.
export function getPaymentMethods() {
  return {
    paystack: Boolean(env.paystack),
    mpesa: Boolean(env.mpesa),
    mock: env.ENABLE_MOCK_PAYMENTS,
  };
}

export async function initializePayment(orderId: string, userId: string, input: InitializePaymentInput) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: { select: { email: true } } },
  });

  // Same message for "missing" and "not yours" so order ids can't be probed.
  if (!order || order.userId !== userId) throw ApiError.notFound("Order not found");
  if (order.status === "PAID") throw ApiError.badRequest("Order is already paid");
  if (order.status !== "PENDING" && order.status !== "RESERVED") {
    throw ApiError.badRequest(`This order is ${order.status.toLowerCase()} and can no longer be paid`);
  }
  if (order.reservationExpiresAt && order.reservationExpiresAt < new Date()) {
    throw ApiError.badRequest("Your reservation has expired. Please create a new order.");
  }

  const base = {
    orderId: order.id,
    reference: order.reference,
    amount: order.totalCents,
    currency: order.currency,
    expiresAt: order.reservationExpiresAt,
  };

  switch (input.provider) {
    case "PAYSTACK": {
      const result = await startPaystackPayment(order, order.user.email);
      // The frontend sends the customer to authorizationUrl.
      return { ...base, provider: "PAYSTACK" as const, authorizationUrl: result.authorizationUrl };
    }

    case "MPESA": {
      const result = await startMpesaPayment(order, input.phone);
      return { ...base, provider: "MPESA" as const, checkoutRequestId: result.checkoutRequestId, message: result.message };
    }

    case "MOCK": {
      if (!env.ENABLE_MOCK_PAYMENTS) throw ApiError.badRequest("Mock payments are disabled");
      return { ...base, provider: "MOCK" as const, clientSecret: `mock_secret_${order.reference}` };
    }
  }
}

// The frontend polls this after the customer taps "Pay" (or returns from Paystack)
// until `paid` is true or `failureReason` appears.
export async function getPaymentStatus(orderId: string, userId: string) {
  const owned = await prisma.order.findUnique({ where: { id: orderId }, select: { userId: true } });
  if (!owned || owned.userId !== userId) throw ApiError.notFound("Order not found");

  // If a Paystack checkout is open, ask Paystack now instead of waiting for the webhook.
  await refreshPendingPaystackPayment(orderId);

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  const latest = order.payments[0];
  const reason = toJsonObject(latest?.metadata).reason;

  return {
    reference: order.reference,
    orderStatus: order.status,
    paid: order.status === "PAID",
    paymentStatus: latest?.status ?? null,
    failureReason: latest?.status === "FAILED" ? (typeof reason === "string" ? reason : "The payment was not completed") : null,
    expiresAt: order.reservationExpiresAt,
  };
}
// ==========================================
// END OF FILE: backend/src/modules/payments/payments.service.ts
// ==========================================