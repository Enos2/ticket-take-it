// ==========================================
// FILE: backend/src/modules/orders/receipt.service.ts
// PURPOSE: The data for an itemised receipt of a paid order.
// ==========================================
import { Role } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { toJsonObject } from "../../utils/json";

// Payments set aside for a refund because something was wrong are not part of the buyer's receipt.
const NOT_ON_RECEIPT = new Set(["order_already_settled", "stock_unavailable_after_expiry", "amount_mismatch"]);

export async function getReceipt(userId: string, role: Role, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { fullName: true, email: true } },
      items: {
        include: {
          ticketType: {
            select: {
              name: true,
              event: { select: { title: true, startsAt: true, venue: true, city: true, seller: { select: { businessName: true } } } },
            },
          },
        },
      },
      payments: { where: { status: { in: ["SUCCEEDED", "REFUNDED"] } }, orderBy: { createdAt: "asc" } },
    },
  });

  // Same answer for "missing" and "not yours".
  if (!order || (order.userId !== userId && role !== "ADMIN")) throw ApiError.notFound("Order not found");
  if (order.status !== "PAID" && order.status !== "REFUNDED") {
    throw ApiError.badRequest("A receipt is only available for paid orders");
  }

  const payments = order.payments
    .filter((p) => !NOT_ON_RECEIPT.has(String(toJsonObject(p.metadata).reason ?? "")))
    .map((p) => {
      const meta = toJsonObject(p.metadata);
      const mpesaReceipt = typeof meta.mpesaReceipt === "string" ? meta.mpesaReceipt : null;
      return {
        method: p.provider,
        // M-Pesa's own receipt number is the useful reference. For Paystack it is our payment reference.
        reference: mpesaReceipt ?? (p.provider === "MPESA" ? null : p.providerRef),
        amountCents: p.amountCents,
        currency: p.currency,
      };
    });

  return {
    reference: order.reference,
    status: order.status,
    currency: order.currency,
    totalCents: order.totalCents,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    refundedAt: order.refundedAt,
    buyer: order.user,
    lines: order.items.map((item) => ({
      eventTitle: item.ticketType.event.title,
      eventStartsAt: item.ticketType.event.startsAt,
      venue: item.ticketType.event.venue,
      city: item.ticketType.event.city,
      organizer: item.ticketType.event.seller.businessName,
      ticketName: item.ticketType.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      subtotalCents: item.subtotalCents,
    })),
    payments,
  };
}
// ==========================================
// END OF FILE: backend/src/modules/orders/receipt.service.ts
// ==========================================