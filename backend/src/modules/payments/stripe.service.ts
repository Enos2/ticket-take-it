// ==========================================
// FILE: backend/src/modules/payments/stripe.service.ts
// PURPOSE: Starts Stripe card checkouts, settles payments, handles webhooks and reconciles stuck payments.
// ==========================================
import type Stripe from "stripe";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";
import { toJsonObject } from "../../utils/json";
import { logger } from "../../utils/logger";
import { createCheckoutSession, retrieveCheckoutSession } from "./stripe.client";
import { handleWebhook } from "./settlement.service";

interface PayableOrder {
  id: string;
  reference: string;
  totalCents: number;
  currency: string;
}

// An open checkout is reused for this long, so a double click doesn't create several.
const CHECKOUT_REUSE_MS = 10 * 60_000;

// Stripe closes an unfinished checkout by itself after about 30 minutes. This is only a safety net.
const ABANDON_AFTER_MS = 2 * 60 * 60_000;

export async function startStripePayment(order: PayableOrder, email: string) {
  if (!env.stripe) throw ApiError.badRequest("Card payments are not available right now");

  const open = await prisma.payment.findFirst({
    where: {
      orderId: order.id,
      provider: "STRIPE",
      status: "PENDING",
      createdAt: { gt: new Date(Date.now() - CHECKOUT_REUSE_MS) },
    },
    orderBy: { createdAt: "desc" },
  });
  const existingUrl = toJsonObject(open?.metadata).checkoutUrl;
  if (open && typeof existingUrl === "string") return { checkoutUrl: existingUrl };

  const currency = order.currency.toUpperCase();
  const appUrl = env.APP_URL.replace(/\/+$/, "");

  const session = await createCheckoutSession({
    orderId: order.id,
    orderReference: order.reference,
    amountCents: order.totalCents,
    currency,
    email,
    // The customer lands here after paying. The page then polls the payment status.
    successUrl: `${appUrl}/checkout/complete?orderId=${encodeURIComponent(order.id)}`,
    cancelUrl: `${appUrl}/checkout/${encodeURIComponent(order.id)}`,
  });

  await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: "STRIPE",
      providerRef: session.id,
      status: "PENDING",
      amountCents: order.totalCents,
      currency,
      metadata: { checkoutUrl: session.url },
    },
  });

  return { checkoutUrl: session.url };
}

export type StripeOutcome = "paid" | "failed" | "pending" | "unknown";

// The ONE path that turns a Stripe payment into a paid order. Webhooks, status polling and the
// reconciliation job all call it. It never trusts the caller: Stripe's own API decides the outcome.
export async function settleStripePayment(sessionId: string): Promise<StripeOutcome> {
  const payment = await prisma.payment.findFirst({
    where: { provider: "STRIPE", providerRef: sessionId },
    include: { order: { select: { reference: true } } },
  });
  // One Stripe account can serve several apps. Sessions that aren't ours are ignored.
  if (!payment) {
    logger.warn(`Stripe session ${sessionId} is not one of ours`);
    return "unknown";
  }

  // Already settled (for example a replayed webhook).
  const settled = await prisma.payment.findFirst({
    where: { provider: "STRIPE", providerRef: sessionId, status: { in: ["SUCCEEDED", "REFUNDED"] } },
    select: { id: true },
  });
  if (settled) return "paid";

  const session = await retrieveCheckoutSession(sessionId);
  if (!session) return "pending";

  if (session.paymentStatus === "paid") {
    // handleWebhook compares the amount and currency with the order. A mismatch is recorded in the
    // needs-refund queue instead of issuing tickets.
    await handleWebhook({
      reference: payment.order.reference,
      status: "SUCCEEDED",
      provider: "STRIPE",
      providerRef: sessionId,
      amountCents: session.amountCents,
      currency: session.currency || payment.currency,
      metadata: { stripeSessionId: session.id, paymentIntentId: session.paymentIntentId },
    });
    return "paid";
  }

  if (session.status === "expired") {
    await handleWebhook({
      reference: payment.order.reference,
      status: "FAILED",
      provider: "STRIPE",
      providerRef: sessionId,
      amountCents: payment.amountCents,
      currency: payment.currency,
      metadata: { reason: "The card checkout expired before it was completed" },
    });
    return "failed";
  }

  // open, or complete but still waiting for a slow payment method: the customer may still finish.
  return "pending";
}

// A payment method that confirms later (such as a bank debit) told us it failed.
async function failStripePayment(sessionId: string, reason: string): Promise<void> {
  const payment = await prisma.payment.findFirst({
    where: { provider: "STRIPE", providerRef: sessionId },
    include: { order: { select: { reference: true } } },
  });
  if (!payment) return;

  const settled = await prisma.payment.findFirst({
    where: { provider: "STRIPE", providerRef: sessionId, status: { in: ["SUCCEEDED", "REFUNDED"] } },
    select: { id: true },
  });
  if (settled) return;

  await handleWebhook({
    reference: payment.order.reference,
    status: "FAILED",
    provider: "STRIPE",
    providerRef: sessionId,
    amountCents: payment.amountCents,
    currency: payment.currency,
    metadata: { reason },
  });
}

// ------------------------------------------------------------- webhook

// Throws only for problems worth retrying. Stripe redelivers anything that isn't answered with 200.
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.expired": {
      await settleStripePayment(event.data.object.id);
      return;
    }

    case "checkout.session.async_payment_failed": {
      await failStripePayment(event.data.object.id, "The payment was not completed");
      return;
    }

    case "charge.dispute.created": {
      logger.warn(`Stripe dispute ${event.data.object.id} opened. Handle it in the Stripe dashboard.`);
      return;
    }

    case "charge.refunded": {
      // A refund made in the Stripe dashboard does not cancel the tickets here.
      logger.warn(`Stripe charge ${event.data.object.id} was refunded outside the app. The order is unchanged.`);
      return;
    }

    default:
      return; // events we don't use
  }
}

// ----------------------------------------------- status polling helper

const lastChecked = new Map<string, number>();

// Called while the frontend polls. Settles the payment as soon as the customer is back from Stripe,
// without waiting for the webhook. This also makes local testing work without a public URL.
export async function refreshPendingStripePayment(orderId: string): Promise<void> {
  if (!env.stripe) return;

  const pending = await prisma.payment.findFirst({
    where: { orderId, provider: "STRIPE", status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: { id: true, providerRef: true, createdAt: true },
  });
  if (!pending?.providerRef) return;

  const now = Date.now();
  if (now - pending.createdAt.getTime() < 3_000) return;
  if (now - (lastChecked.get(pending.id) ?? 0) < 4_000) return; // at most one check per 4 seconds
  lastChecked.set(pending.id, now);
  if (lastChecked.size > 1_000) lastChecked.clear();

  try {
    await settleStripePayment(pending.providerRef);
  } catch (err) {
    logger.warn({ err }, "Stripe status refresh failed");
  }
}

// -------------------------------------------------------- reconciliation

// Runs every minute. Catches payments whose webhook never arrived and closes checkouts nobody finished.
export async function reconcileStripePayments(): Promise<number> {
  if (!env.stripe) return 0;

  const now = Date.now();
  let changed = 0;

  const pending = await prisma.payment.findMany({
    where: {
      provider: "STRIPE",
      status: "PENDING",
      createdAt: { lt: new Date(now - 60_000), gt: new Date(now - ABANDON_AFTER_MS) },
    },
    select: { providerRef: true },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  for (const p of pending) {
    if (!p.providerRef) continue;
    try {
      const outcome = await settleStripePayment(p.providerRef);
      if (outcome === "paid" || outcome === "failed") changed++;
    } catch (err) {
      logger.error({ err }, `Stripe reconcile failed for ${p.providerRef}`);
    }
  }

  try {
    const closed = await prisma.payment.updateMany({
      where: { provider: "STRIPE", status: "PENDING", createdAt: { lt: new Date(now - ABANDON_AFTER_MS) } },
      data: { status: "FAILED", metadata: { reason: "Checkout was not completed" } },
    });
    changed += closed.count;
  } catch (err) {
    logger.error({ err }, "Could not close abandoned Stripe checkouts");
  }

  return changed;
}
// ==========================================
// END OF FILE: backend/src/modules/payments/stripe.service.ts
// ==========================================