// ==========================================
// FILE: backend/src/modules/finance/finance.notifications.ts
// PURPOSE: Emails a seller when a payout is sent, and when their payout details change.
// ==========================================
import { prisma } from "../../config/database";
import { sendEmail } from "../../utils/email";
import { appLink, button, esc, layout, para, small } from "../../utils/emailTemplates";

const METHOD_NAME = { MPESA: "M-Pesa", BANK: "bank transfer", OTHER: "another method" } as const;

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

// Safe to call from a background task: it never throws into the request.
export async function notifyPayout(payoutId: string) {
  const payout = await prisma.payout.findUnique({
    where: { id: payoutId },
    include: { seller: { select: { businessName: true, user: { select: { email: true, fullName: true } } } } },
  });
  if (!payout) return;

  const amount = money(payout.amountCents, payout.currency);
  const method = METHOD_NAME[payout.method];
  const name = payout.seller.user.fullName;
  const url = appLink("/seller/earnings");

  await sendEmail({
    to: payout.seller.user.email,
    subject: `Payout of ${amount} sent`,
    html: layout(
      "Your payout is on its way",
      para(`Hi ${esc(name)}, we sent <strong>${esc(amount)}</strong> to ${esc(payout.seller.businessName)} by ${esc(method)}.`) +
        (payout.reference ? para(`Reference: <strong>${esc(payout.reference)}</strong>`) : "") +
        button(url, "View your earnings") +
        small("If you were not expecting this payout, or the amount looks wrong, reply to this email.")
    ),
    text: `Hi ${name},\n\nWe sent ${amount} to ${payout.seller.businessName} by ${method}.${payout.reference ? `\nReference: ${payout.reference}` : ""}\n\nView your earnings: ${url}`,
  });
}

export async function notifyPayoutDetailsChanged(sellerId: string) {
  const seller = await prisma.sellerProfile.findUnique({
    where: { id: sellerId },
    select: { businessName: true, user: { select: { email: true, fullName: true } } },
  });
  if (!seller) return;

  const url = appLink("/seller/earnings");

  await sendEmail({
    to: seller.user.email,
    subject: "Your payout details were changed",
    html: layout(
      "Payout details changed",
      para(`Hi ${esc(seller.user.fullName)}, the payout details for ${esc(seller.businessName)} were just changed.`) +
        para("If this was you, there is nothing to do.") +
        para("<strong>If it was not you</strong>, someone may have your password. Reset your password straight away and contact us.") +
        button(url, "Review payout details") +
        small("Payouts are always sent to the details saved on your account.")
    ),
    text: `Hi ${seller.user.fullName},\n\nThe payout details for ${seller.businessName} were just changed.\n\nIf this was you, there is nothing to do. If it was not you, someone may have your password: reset it straight away and contact us.\n\nReview them: ${url}`,
  });
}
// ==========================================
// END OF FILE: backend/src/modules/finance/finance.notifications.ts
// ==========================================