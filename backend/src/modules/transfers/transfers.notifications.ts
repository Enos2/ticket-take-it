// ==========================================
// FILE: backend/src/modules/transfers/transfers.notifications.ts
// PURPOSE: Loads the data and sends the emails for ticket transfers.
// ==========================================
import { prisma } from "../../config/database";
import { sendEmail } from "../../utils/email";
import { transferAcceptedEmail, transferReceivedEmail } from "../../utils/transferTemplates";

// Tells the recipient a ticket is waiting for them. Safe to call from a background task.
export async function notifyTransferReceived(transferId: string) {
  const transfer = await prisma.ticketTransfer.findUnique({
    where: { id: transferId },
    select: {
      toEmail: true,
      message: true,
      expiresAt: true,
      status: true,
      from: { select: { fullName: true } },
      ticket: {
        select: {
          ticketType: { select: { name: true } },
          event: { select: { title: true, startsAt: true, venue: true, city: true } },
        },
      },
    },
  });
  if (!transfer || transfer.status !== "PENDING") return;

  const recipient = await prisma.user.findFirst({
    where: { email: { equals: transfer.toEmail, mode: "insensitive" }, isActive: true, deletedAt: null },
    select: { id: true },
  });

  await sendEmail({
    to: transfer.toEmail,
    ...transferReceivedEmail({
      fromName: transfer.from.fullName,
      eventTitle: transfer.ticket.event.title,
      ticketName: transfer.ticket.ticketType.name,
      startsAt: transfer.ticket.event.startsAt,
      venue: transfer.ticket.event.venue,
      city: transfer.ticket.event.city,
      message: transfer.message,
      expiresAt: transfer.expiresAt,
      hasAccount: recipient !== null,
    }),
  });
}

// Tells the sender the ticket now belongs to someone else.
export async function notifyTransferAccepted(transferId: string) {
  const transfer = await prisma.ticketTransfer.findUnique({
    where: { id: transferId },
    select: {
      toEmail: true,
      status: true,
      from: { select: { email: true, fullName: true } },
      ticket: { select: { ticketType: { select: { name: true } }, event: { select: { title: true } } } },
    },
  });
  if (!transfer || transfer.status !== "ACCEPTED") return;

  await sendEmail({
    to: transfer.from.email,
    ...transferAcceptedEmail({
      name: transfer.from.fullName,
      toEmail: transfer.toEmail,
      eventTitle: transfer.ticket.event.title,
      ticketName: transfer.ticket.ticketType.name,
    }),
  });
}
// ==========================================
// END OF FILE: backend/src/modules/transfers/transfers.notifications.ts
// ==========================================