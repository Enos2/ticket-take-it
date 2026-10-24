// ==========================================
// FILE: backend/src/modules/payments/paystack.service.ts
// PURPOSE: Starts Paystack checkouts, settles payments, handles webhooks and reconciles stuck payments.
// ==========================================
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";
import { toJsonObject } from "../../utils/json";
import { logger } from "../../utils/logger";
import { initializeTransaction, refundTransaction, verifyTransaction } from "./paystack.client";
import { handleWebhook } from "./settlement.service";

interface PayableOrder {
  id: string;
  reference: string;
  totalCents: number;
  currency: string;
}

// An open checkout is reused for this long, so a double click doesn't create several.
const CHECKOUT_REUSE_MS = 10 * 60_000;

// Checkouts nobody completed are closed after this long.
const ABANDON_AFTER_MS = 6 * 60 * 60_000;

export async function startPaystackPayment(order: PayableOrder, email: string) {
  if (!env.paystack) throw ApiError.badRequest("Online payments are not available right now");

  const open = await prisma.payment.findFirst({
    where: {
      orderId: order.id,
      provider: "PAYSTACK",
      status: "PENDING",
      createdAt: { gt: new Date(Date.now() - CHECKOUT_REUSE_MS) },
    },
    orderBy: { createdAt: "desc" },
  });
  const existingUrl = toJsonObject(open?.metadata).authorizationUrl;
  if (open && typeof existingUrl === "string") return { authorizationUrl: existingUrl };

  // A fresh reference for every attempt: Paystack rejects a reference it has already seen.
  const reference = `${order.reference}-${randomBytes(4).toString("hex")}`;
  const currency = order.currency.toUpperCase();

  const init = await initializeTransaction({
    email,
    amountCents: order.totalCents,
    currency,
    reference,
    // Paystack adds ?trxref=...&reference=... when it sends the customer back here.
    callbackUrl: `${env.APP_URL.replace(/\/+$/, "")}/checkout/complete?orderId=${encodeURIComponent(order.id)}`,
    metadata: { orderId: order.id, orderReference: order.reference },
  });

  await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: "PAYSTACK",
      providerRef: reference,
      status: "PENDING",
      amountCents: order.totalCents,
      currency,
      metadata: { authorizationUrl: init.authorizationUrl, accessCode: init.accessCode },
    },
  });

  return { authorizationUrl: init.authorizationUrl };
}

export type PaystackOutcome = "paid" | "failed" | "pending" | "unknown";

// The ONE path that turns a Paystack payment into a paid order. Webhooks, status polling and the
// reconciliation job all call it. It never trusts the caller: Paystack's own API decides the outcome.
export async function settlePaystackPayment(reference: string): Promise<PaystackOutcome> {
  const payment = await prisma.payment.findFirst({
    where: { provider: "PAYSTACK", providerRef: reference },
    include: { order: { select: { reference: true } } },
  });
  // One Paystack account can serve several apps. References that aren't ours are ignored.
  if (!payment) {
    logger.warn(`Paystack reference ${reference} is not one of ours`);
    return "unknown";
  }

  // Already settled (for example a replayed webhook).
  const settled = await prisma.payment.findFirst({
    where: { provider: "PAYSTACK", providerRef: reference, status: { in: ["SUCCEEDED", "REFUNDED"] } },
    select: { id: true },
  });
  if (settled) return "paid";

  const tx = await verifyTransaction(reference);
  if (!tx) return "pending";

  if (tx.status === "success") {
    // handleWebhook compares tx.amountCents and tx.currency with the order.
    // A mismatch is recorded in the needs-refund queue instead of issuing tickets.
    await handleWebhook({
      reference: payment.order.reference,
      status: "SUCCEEDED",
      provider: "PAYSTACK",
      providerRef: reference,
      amountCents: tx.amountCents,
      currency: tx.currency || payment.currency,
      metadata: { paystackId: tx.id, channel: tx.channel },
    });
    return "paid";
  }

  if (tx.status === "failed") {
    await handleWebhook({
      reference: payment.order.reference,
      status: "FAILED",
      provider: "PAYSTACK",
      providerRef: reference,
      amountCents: payment.amountCents,
      currency: payment.currency,
      metadata: { reason: tx.gatewayResponse ?? "The payment was not completed" },
    });
    return "failed";
  }

  // abandoned, ongoing, pending, processing, queued: the customer may still finish.
  return "pending";
}

// ------------------------------------------------------------- webhook

const eventSchema = z
  .object({
    event: z.string().max(100),
    data: z
      .object({
        reference: z.string().optional(),
        transaction_reference: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough();

// Throws only for problems worth retrying. Paystack redelivers anything that isn't answered with 200.
export async function handlePaystackEvent(raw: unknown): Promise<void> {
  const parsed = eventSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn("Ignored a malformed Paystack event");
    return;
  }
  const { event, data } = parsed.data;

  switch (event) {
    case "charge.success": {
      if (data.reference) await settlePaystackPayment(data.reference);
      return;
    }

    case "refund.processed": {
      const ref = data.transaction_reference ?? data.reference;
      if (!ref) return;
      const payment = await prisma.payment.findFirst({
        where: { provider: "PAYSTACK", providerRef: ref, status: "REFUNDED" },
      });
      if (!payment) return;
      await prisma.payment.updateMany({
        where: { id: payment.id, status: "REFUNDED" },
        data: {
          metadata: {
            ...toJsonObject(payment.metadata),
            refundStatus: "processed",
            refundProcessedAt: new Date().toISOString(),
          },
        },
      });
      return;
    }

    case "refund.failed": {
      // The refund was accepted earlier but Paystack could not complete it. Put the payment back in the queue.
      const ref = data.transaction_reference ?? data.reference;
      if (!ref) return;
      const payment = await prisma.payment.findFirst({
        where: { provider: "PAYSTACK", providerRef: ref, status: "REFUNDED" },
      });
      if (!payment) return;
      await prisma.payment.updateMany({
        where: { id: payment.id, status: "REFUNDED" },
        data: {
          status: "SUCCEEDED",
          metadata: {
            ...toJsonObject(payment.metadata),
            needsRefund: true,
            refundStatus: "failed",
            lastRefundError: "Paystack reported that the refund failed",
          },
        },
      });
      logger.error(`Paystack refund failed for ${ref}. Back in the needs-refund queue.`);
      return;
    }

    case "charge.dispute.create": {
      logger.warn(`Paystack dispute opened for ${data.reference ?? "unknown reference"}. Handle it in the Paystack dashboard.`);
      return;
    }

    default:
      return; // events we don't use
  }
}

// ----------------------------------------------- status polling helper

const lastChecked = new Map<string, number>();

// Called while the frontend polls. Settles the payment as soon as the customer is back from Paystack,
// without waiting for the webhook. This also makes local testing work without a public URL.
export async function refreshPendingPaystackPayment(orderId: string): Promise<void> {
  if (!env.paystack) return;

  const pending = await prisma.payment.findFirst({
    where: { orderId, provider: "PAYSTACK", status: "PENDING" },
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
    await settlePaystackPayment(pending.providerRef);
  } catch (err) {
    logger.warn({ err }, "Paystack status refresh failed");
  }
}

// -------------------------------------------------------- reconciliation

// Runs every minute. Catches payments whose webhook never arrived and closes checkouts nobody finished.
export async function reconcilePaystackPayments(): Promise<number> {
  if (!env.paystack) return 0;

  const now = Date.now();
  let changed = 0;

  const pending = await prisma.payment.findMany({
    where: {
      provider: "PAYSTACK",
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
      const outcome = await settlePaystackPayment(p.providerRef);
      if (outcome === "paid" || outcome === "failed") changed++;
    } catch (err) {
      logger.error({ err }, `Paystack reconcile failed for ${p.providerRef}`);
    }
  }

  try {
    const closed = await prisma.payment.updateMany({
      where: { provider: "PAYSTACK", status: "PENDING", createdAt: { lt: new Date(now - ABANDON_AFTER_MS) } },
      data: { status: "FAILED", metadata: { reason: "Checkout was not completed" } },
    });
    changed += closed.count;
  } catch (err) {
    logger.error({ err }, "Could not close abandoned Paystack checkouts");
  }

  return changed;
}

// -------------------------------------------------------------- refunds

export async function refundPaystackPayment(payment: { id: string; providerRef: string | null }, note?: string) {
  if (!payment.providerRef) throw ApiError.badRequest("This payment has no Paystack reference");
  return refundTransaction(payment.providerRef, note);
}
// ==========================================
// END OF FILE: backend/src/modules/payments/paystack.service.ts
// ==========================================