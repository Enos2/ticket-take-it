// ==========================================
// FILE: backend/src/modules/notifications/notifications.service.ts
// PURPOSE: Loads the data and sends order, refund, cancellation and seller emails.
// ==========================================
import { SellerProfile } from "@prisma/client";
import { prisma } from "../../config/database";
import { sendEmail } from "../../utils/email";
import {
  orderConfirmationEmail,
  orderRefundedEmail,
  eventCancelledEmail,
  sellerStatusEmail,
} from "../../utils/emailTemplates";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Order confirmation with a link to the QR tickets. Safe to call from a background task.
export async function notifyOrderPaid(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { email: true, fullName: true } },
      items: {
        include: {
          ticketType: {
            select: {
              name: true,
              event: { select: { title: true, venue: true, city: true, startsAt: true } },
            },
          },
        },
      },
    },
  });
  if (!order || order.status !== "PAID") return;

  await sendEmail({
    to: order.user.email,
    ...orderConfirmationEmail({
      name: order.user.fullName,
      reference: order.reference,
      totalCents: order.totalCents,
      currency: order.currency,
      lines: order.items.map((item) => ({
        eventTitle: item.ticketType.event.title,
        venue: item.ticketType.event.venue,
        city: item.ticketType.event.city,
        startsAt: item.ticketType.event.startsAt,
        ticketName: item.ticketType.name,
        quantity: item.quantity,
      })),
    }),
  });
}

export async function notifyOrderRefunded(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { user: { select: { email: true, fullName: true } } },
  });
  if (!order || order.status !== "REFUNDED") return;

  await sendEmail({
    to: order.user.email,
    ...orderRefundedEmail({
      name: order.user.fullName,
      reference: order.reference,
      totalCents: order.totalCents,
      currency: order.currency,
    }),
  });
}

// Tells every buyer with a paid order for the event. Sent one at a time to stay under provider rate limits.
export async function notifyEventCancelled(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { title: true } });
  if (!event) return;

  const orders = await prisma.order.findMany({
    where: { status: "PAID", items: { some: { ticketType: { eventId } } } },
    select: { reference: true, user: { select: { email: true, fullName: true } } },
  });

  for (const order of orders) {
    await sendEmail({
      to: order.user.email,
      ...eventCancelledEmail({
        name: order.user.fullName,
        eventTitle: event.title,
        reference: order.reference,
      }),
    });
    await sleep(600);
  }
}

export async function notifySellerStatusChanged(sellerId: string) {
  const seller = await prisma.sellerProfile.findUnique({
    where: { id: sellerId },
    include: { user: { select: { email: true, fullName: true } } },
  });
  if (!seller) return;

  const status: SellerProfile["status"] = seller.status;
  if (status === "PENDING") return; // nothing to tell them

  await sendEmail({
    to: seller.user.email,
    ...sellerStatusEmail({ name: seller.user.fullName, businessName: seller.businessName, status }),
  });
}
// ==========================================
// END OF FILE: backend/src/modules/notifications/notifications.service.ts
// ==========================================