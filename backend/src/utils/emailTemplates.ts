// ==========================================
// FILE: backend/src/utils/emailTemplates.ts
// PURPOSE: HTML and plain-text email templates in the Ticket Take It brand.
// ==========================================
import { env } from "../config/env";

const BRAND = {
  black: "#0B0B0D",
  charcoal: "#18181B",
  red: "#E32636",
  gold: "#C9A45C",
  text: "#F5F5F5",
  muted: "#A1A1AA",
  line: "#2A2A2E",
};

// Events have no timezone field yet, so times are shown in Nairobi time.
const EVENT_TIMEZONE = "Africa/Nairobi";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// Escape anything a user typed (names, event titles) before it goes into HTML.
export const esc = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const appLink = (path: string) => `${env.APP_URL.replace(/\/+$/, "")}${path}`;

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function when(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: EVENT_TIMEZONE,
  }).format(date);
}

const para = (html: string) =>
  `<p style="margin:0 0 16px;color:${BRAND.text};font-size:15px;line-height:1.6;">${html}</p>`;

const small = (html: string) =>
  `<p style="margin:16px 0 0;color:${BRAND.muted};font-size:13px;line-height:1.5;">${html}</p>`;

const button = (url: string, label: string) =>
  `<p style="margin:24px 0;"><a href="${esc(url)}" style="display:inline-block;background:${BRAND.red};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:8px;">${esc(label)}</a></p>`;

function layout(heading: string, inner: string): string {
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:${BRAND.black};font-family:Inter,Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.black};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${BRAND.charcoal};border:1px solid ${BRAND.line};border-radius:12px;">
<tr><td style="padding:24px 32px;border-bottom:1px solid ${BRAND.line};"><span style="color:${BRAND.gold};font-size:13px;letter-spacing:2px;text-transform:uppercase;">Ticket Take It</span></td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 16px;font-size:22px;color:${BRAND.text};">${esc(heading)}</h1>
${inner}
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid ${BRAND.line};color:${BRAND.muted};font-size:12px;">Your World. Your Moment.</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ---------------------------------------------------------------- templates

export function verifyEmailEmail(name: string, url: string): RenderedEmail {
  return {
    subject: "Verify your email for Ticket Take It",
    html: layout(
      "Verify your email",
      para(`Hi ${esc(name)}, welcome to Ticket Take It. Confirm your email address to start buying and selling tickets.`) +
        button(url, "Verify email") +
        small("This link expires in 24 hours. If you didn't create an account, you can ignore this email.")
    ),
    text: `Hi ${name},\n\nConfirm your email address to start using Ticket Take It:\n${url}\n\nThis link expires in 24 hours. If you didn't create an account, ignore this email.`,
  };
}

export function resetPasswordEmail(name: string, url: string): RenderedEmail {
  return {
    subject: "Reset your Ticket Take It password",
    html: layout(
      "Reset your password",
      para(`Hi ${esc(name)}, we received a request to reset your password.`) +
        button(url, "Choose a new password") +
        small("This link expires in 1 hour and works once. If you didn't ask for this, you can ignore this email. Your password won't change.")
    ),
    text: `Hi ${name},\n\nReset your Ticket Take It password:\n${url}\n\nThis link expires in 1 hour and works once. If you didn't ask for this, ignore this email.`,
  };
}

export interface OrderLine {
  eventTitle: string;
  venue: string;
  city: string;
  startsAt: Date;
  ticketName: string;
  quantity: number;
}

export function orderConfirmationEmail(input: {
  name: string;
  reference: string;
  lines: OrderLine[];
  totalCents: number;
  currency: string;
}): RenderedEmail {
  const total = input.totalCents === 0 ? "Free" : money(input.totalCents, input.currency);
  const ticketsUrl = appLink("/my-tickets");

  const rows = input.lines
    .map(
      (l) =>
        `<tr><td style="padding:12px 0;border-bottom:1px solid ${BRAND.line};color:${BRAND.text};font-size:14px;">
<strong>${l.quantity} × ${esc(l.ticketName)}</strong><br/>
<span style="color:${BRAND.gold};">${esc(l.eventTitle)}</span><br/>
<span style="color:${BRAND.muted};">${esc(when(l.startsAt))}<br/>${esc(l.venue)}, ${esc(l.city)}</span>
</td></tr>`
    )
    .join("");

  const textLines = input.lines
    .map((l) => `- ${l.quantity} x ${l.ticketName}\n  ${l.eventTitle}\n  ${when(l.startsAt)}\n  ${l.venue}, ${l.city}`)
    .join("\n");

  return {
    subject: `Your tickets are confirmed (${input.reference})`,
    html: layout(
      "You're going!",
      para(`Hi ${esc(input.name)}, your order <strong>${esc(input.reference)}</strong> is confirmed.`) +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>` +
        para(`<br/>Total: <strong>${esc(total)}</strong>`) +
        button(ticketsUrl, "View my tickets and QR codes") +
        small("Show the QR code on your ticket at the door. Each code works once, so don't share it.")
    ),
    text: `Hi ${input.name},\n\nYour order ${input.reference} is confirmed.\n\n${textLines}\n\nTotal: ${total}\n\nView your tickets and QR codes: ${ticketsUrl}\n\nEach QR code works once, so don't share it.`,
  };
}

export function orderRefundedEmail(input: {
  name: string;
  reference: string;
  totalCents: number;
  currency: string;
}): RenderedEmail {
  const total = money(input.totalCents, input.currency);
  return {
    subject: `Your order ${input.reference} was refunded`,
    html: layout(
      "Order refunded",
      para(`Hi ${esc(input.name)}, order <strong>${esc(input.reference)}</strong> has been refunded (${esc(total)}). The tickets on it are no longer valid.`) +
        small("Depending on your payment provider, the money can take a few days to show up.")
    ),
    text: `Hi ${input.name},\n\nOrder ${input.reference} has been refunded (${total}). The tickets on it are no longer valid.\n\nDepending on your payment provider, the money can take a few days to show up.`,
  };
}

export function eventCancelledEmail(input: {
  name: string;
  eventTitle: string;
  reference: string;
}): RenderedEmail {
  return {
    subject: `${input.eventTitle} has been cancelled`,
    html: layout(
      "Event cancelled",
      para(`Hi ${esc(input.name)}, we're sorry: <strong>${esc(input.eventTitle)}</strong> has been cancelled.`) +
        para(`Your tickets from order <strong>${esc(input.reference)}</strong> are no longer valid, and you're entitled to a refund. We'll email you again once it has been processed.`)
    ),
    text: `Hi ${input.name},\n\nWe're sorry: ${input.eventTitle} has been cancelled.\n\nYour tickets from order ${input.reference} are no longer valid, and you're entitled to a refund. We'll email you again once it has been processed.`,
  };
}

export function sellerStatusEmail(input: {
  name: string;
  businessName: string;
  status: "APPROVED" | "REJECTED" | "SUSPENDED";
}): RenderedEmail {
  const copy = {
    APPROVED: {
      subject: "Your seller account is approved",
      heading: "You're approved",
      body: `${input.businessName} can now create and publish events on Ticket Take It.`,
      cta: true,
    },
    REJECTED: {
      subject: "Your seller application was not approved",
      heading: "Application not approved",
      body: `We couldn't approve the seller application for ${input.businessName} at this time.`,
      cta: false,
    },
    SUSPENDED: {
      subject: "Your seller account has been suspended",
      heading: "Account suspended",
      body: `The seller account for ${input.businessName} has been suspended. You can't publish or manage events until it is reinstated.`,
      cta: false,
    },
  }[input.status];

  return {
    subject: copy.subject,
    html: layout(
      copy.heading,
      para(`Hi ${esc(input.name)}, ${esc(copy.body)}`) + (copy.cta ? button(appLink("/seller"), "Open seller dashboard") : "")
    ),
    text: `Hi ${input.name},\n\n${copy.body}${copy.cta ? `\n\nOpen your seller dashboard: ${appLink("/seller")}` : ""}`,
  };
}
// ==========================================
// END OF FILE: backend/src/utils/emailTemplates.ts
// ==========================================