// ==========================================
// FILE: backend/src/modules/payments/payments.service.ts
// PURPOSE: Handles payment initialization and webhooks.
// ==========================================
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";

export async function initializePayment(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  
  if (!order) throw ApiError.notFound("Order not found");
  if (order.userId !== userId) throw ApiError.forbidden("You don't own this order");
  if (order.status === "PAID") throw ApiError.badRequest("Order is already paid");

  // In a real app, this is where you call Stripe or M-Pesa API.
  // For now, we return a mock payment intent.
  return {
    clientSecret: `mock_secret_${order.reference}`,
    amount: order.totalCents,
    currency: order.currency,
  };
}

export async function handleWebhook(reference: string, status: "SUCCEEDED" | "FAILED") {
  const order = await prisma.order.findUnique({ where: { reference } });
  if (!order) throw ApiError.notFound("Order not found");

  if (status === "SUCCEEDED") {
    await prisma.$transaction([
      prisma.order.update({
        where: { id: order.id },
        data: { status: "PAID", paidAt: new Date() },
      }),
      prisma.payment.create({
        data: {
          orderId: order.id,
          provider: "STRIPE",
          status: "SUCCEEDED",
          amountCents: order.totalCents,
          providerRef: `mock_ref_${Date.now()}`,
        },
      }),
    ]);
  } else {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED" },
    });
  }
}
// ==========================================
// END OF FILE: backend/src/modules/payments/payments.service.ts
// LOCATION: backend/src/modules/payments/payments.service.ts
// LAST UPDATED: October 21, 2026
// ==========================================