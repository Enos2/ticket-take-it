// ==========================================
// FILE: backend/src/utils/resaleTemplates.ts
// PURPOSE: Emails for ticket resale.
// ==========================================
import { appLink, button, esc, layout, para, small } from "./emailTemplates";
import type { RenderedEmail } from "./emailTemplates";

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-KE", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

// To the person who sold the ticket.
export function resaleSoldEmail(input: {
  name: string;
  eventTitle: string;
  ticketName: string;
  priceCents: number;
  feeCents: number;
  netCents: number;
  currency: string;
  payoutPhone: string;
}): RenderedEmail {
  const title = oneLine(input.eventTitle);
  const ticket = oneLine(input.ticketName);
  const url = appLink("/account/resale");

  return {
    subject: `Your ticket for ${title} was sold`,
    html: layout(
      "Your ticket was sold",
      para(`Hi ${esc(input.name)}, your <strong>${esc(ticket)}</strong> ticket for <strong>${esc(title)}</strong> was bought for ${esc(money(input.priceCents, input.currency))}.`) +
        para(
          `Ticket Take It keeps ${esc(money(input.feeCents, input.currency))} as commission. You will receive <strong>${esc(money(input.netCents, input.currency))}</strong> on M-Pesa number ${esc(input.payoutPhone)}.`
        ) +
        para("The ticket now belongs to the buyer, and your copy of the QR code no longer works.") +
        button(url, "See my resale") +
        small("Payouts are sent by our team, usually within a few days.")
    ),
    text: `Hi ${input.name},\n\nYour ${ticket} ticket for ${title} was bought for ${money(input.priceCents, input.currency)}.\nCommission: ${money(input.feeCents, input.currency)}. You will receive ${money(input.netCents, input.currency)} on M-Pesa number ${input.payoutPhone}.\n\nThe ticket now belongs to the buyer, and your copy of the QR code no longer works.\n\nSee my resale: ${url}\n\nPayouts are sent by our team, usually within a few days.`,
  };
}

// To the person who bought the ticket.
export function resaleBoughtEmail(input: {
  name: string;
  eventTitle: string;
  ticketName: string;
  priceCents: number;
  currency: string;
}): RenderedEmail {
  const title = oneLine(input.eventTitle);
  const ticket = oneLine(input.ticketName);
  const url = appLink("/account/tickets");

  return {
    subject: `Your ticket for ${title}`,
    html: layout(
      "Your ticket is ready",
      para(`Hi ${esc(input.name)}, you bought a <strong>${esc(ticket)}</strong> ticket for <strong>${esc(title)}</strong> for ${esc(money(input.priceCents, input.currency))}.`) +
        para("It has a new QR code, made just for you. You can find it, and download it as a PDF, under My tickets.") +
        button(url, "Open my tickets")
    ),
    text: `Hi ${input.name},\n\nYou bought a ${ticket} ticket for ${title} for ${money(input.priceCents, input.currency)}.\nIt has a new QR code, made just for you. Find it under My tickets: ${url}`,
  };
}
// ==========================================
// END OF FILE: backend/src/utils/resaleTemplates.ts
// ==========================================