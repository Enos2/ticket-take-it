// ==========================================
// FILE: backend/src/utils/transferTemplates.ts
// PURPOSE: Emails for ticket transfers.
// ==========================================
import { appLink, button, esc, layout, para, small } from "./emailTemplates";
import type { RenderedEmail } from "./emailTemplates";

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

// Events have no time zone yet, so times are shown in Nairobi time.
const when = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Nairobi",
  }).format(date);

const day = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "Africa/Nairobi" }).format(date);

export function transferReceivedEmail(input: {
  fromName: string;
  eventTitle: string;
  ticketName: string;
  startsAt: Date;
  venue: string;
  city: string;
  message: string | null;
  expiresAt: Date;
  hasAccount: boolean;
}): RenderedEmail {
  const from = oneLine(input.fromName);
  const title = oneLine(input.eventTitle);
  const ticket = oneLine(input.ticketName);
  const where = `${oneLine(input.venue)}, ${oneLine(input.city)}`;
  const note = input.message ? oneLine(input.message) : "";
  const url = appLink("/account/transfers");

  const accountHint = input.hasAccount
    ? "Sign in with this email address to accept the ticket."
    : "You need a Ticket Take It account that uses this email address. Create one, verify your email, then open the transfer.";

  return {
    subject: `${from} sent you a ticket for ${title}`,
    html: layout(
      "A ticket was sent to you",
      para(`<strong>${esc(from)}</strong> wants to transfer you a <strong>${esc(ticket)}</strong> ticket for <strong>${esc(title)}</strong>.`) +
        para(`${esc(when(input.startsAt))}<br/>${esc(where)}`) +
        (note ? para(`Message from ${esc(from)}: "${esc(note)}"`) : "") +
        button(url, "See the transfer") +
        small(`${esc(accountHint)} The offer expires on ${esc(day(input.expiresAt))}. Once you accept, the ticket is yours and a new QR code is created.`)
    ),
    text: `${from} wants to transfer you a ${ticket} ticket for ${title}.\n${when(input.startsAt)}\n${where}\n${note ? `\nMessage from ${from}: "${note}"\n` : ""}\nSee the transfer: ${url}\n\n${accountHint} The offer expires on ${day(input.expiresAt)}.`,
  };
}

export function transferAcceptedEmail(input: {
  name: string;
  toEmail: string;
  eventTitle: string;
  ticketName: string;
}): RenderedEmail {
  const title = oneLine(input.eventTitle);
  const ticket = oneLine(input.ticketName);
  const url = appLink("/account/tickets");

  return {
    subject: `${input.toEmail} accepted your ticket for ${title}`,
    html: layout(
      "Your ticket was accepted",
      para(`Hi ${esc(input.name)}, <strong>${esc(input.toEmail)}</strong> accepted the <strong>${esc(ticket)}</strong> ticket for <strong>${esc(title)}</strong>.`) +
        para("The ticket now belongs to them, and your copy of the QR code no longer works.") +
        button(url, "Open my tickets")
    ),
    text: `Hi ${input.name},\n\n${input.toEmail} accepted the ${ticket} ticket for ${title}.\nThe ticket now belongs to them, and your copy of the QR code no longer works.\n\nOpen your tickets: ${url}`,
  };
}
// ==========================================
// END OF FILE: backend/src/utils/transferTemplates.ts
// ==========================================