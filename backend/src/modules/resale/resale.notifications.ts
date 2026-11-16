// ==========================================
// FILE: backend/src/modules/resale/resale.notifications.ts
// PURPOSE: Emails the buyer and the seller when a resale is completed.
// ==========================================
import { prisma } from "../../config/database";
import { sendEmail } from "../../utils/email";
import { resaleBoughtEmail, resaleSoldEmail } from "../../utils/resaleTemplates";

// Safe to call from a background task.
export async function notifyResaleCompleted(listingId: string) {
  const listing = await prisma.resaleListing.findUnique({
    where: { id: listingId },
    select: {
      status: true,
      priceCents: true,
      feeCents: true,
      netCents: true,
      currency: true,
      payoutPhone: true,
      seller: { select: { email: true, fullName: true } },
      buyer: { select: { email: true, fullName: true } },
      ticket: { select: { ticketType: { select: { name: true } }, event: { select: { title: true } } } },
    },
  });
  if (!listing || listing.status !== "SOLD" || !listing.buyer) return;

  const eventTitle = listing.ticket.event.title;
  const ticketName = listing.ticket.ticketType.name;

  await sendEmail({
    to: listing.buyer.email,
    ...resaleBoughtEmail({
      name: listing.buyer.fullName,
      eventTitle,
      ticketName,
      priceCents: listing.priceCents,
      currency: listing.currency,
    }),
  });

  await sendEmail({
    to: listing.seller.email,
    ...resaleSoldEmail({
      name: listing.seller.fullName,
      eventTitle,
      ticketName,
      priceCents: listing.priceCents,
      feeCents: listing.feeCents ?? 0,
      netCents: listing.netCents ?? listing.priceCents,
      currency: listing.currency,
      payoutPhone: listing.payoutPhone,
    }),
  });
}
// ==========================================
// END OF FILE: backend/src/modules/resale/resale.notifications.ts
// ==========================================