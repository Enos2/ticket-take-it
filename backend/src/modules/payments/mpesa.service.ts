// ==========================================
// FILE: backend/src/modules/payments/mpesa.service.ts
// PURPOSE: Starts M-Pesa payments, processes Safaricom callbacks and reconciles stuck payments.
// ==========================================
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";
import { logger } from "../../utils/logger";
import { stkPush, stkQuery } from "./mpesa.client";
import { handleWebhook } from "./settlement.service";

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

// Accepts 0712345678, 0112345678, 712345678, 254712345678, +254712345678 and returns 254712345678.
export function normalizeKenyanPhone(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "").replace(/^\+/, "");
  const match = /^(?:254|0)?([17]\d{8})$/.exec(digits);
  return match ? `254${match[1]}` : null;
}

// Only a masked number is stored.
const maskPhone = (phone: string) => `${phone.slice(0, 6)}***${phone.slice(-3)}`;

interface PayableOrder {
  id: string;
  reference: string;
  totalCents: number;
  currency: string;
}

export async function startMpesaPayment(order: PayableOrder, rawPhone?: string) {
  const cfg = env.mpesa;
  if (!cfg || !env.PUBLIC_API_URL) throw ApiError.badRequest("M-Pesa is not available right now");

  if (order.currency.toUpperCase() !== "KES") throw ApiError.badRequest("M-Pesa only supports orders in KES");
  if (order.totalCents % 100 !== 0) throw ApiError.badRequest("M-Pesa amounts must be whole shillings");

  const phone = rawPhone ? normalizeKenyanPhone(rawPhone) : null;
  if (!phone) throw ApiError.badRequest("Enter a valid Safaricom number, for example 0712345678");

  // Don't send a second prompt while the first is still on the customer's phone.
  const recent = await prisma.payment.findFirst({
    where: {
      orderId: order.id,
      provider: "MPESA",
      status: "PENDING",
      createdAt: { gt: new Date(Date.now() - 90_000) },
    },
    select: { id: true },
  });
  if (recent) {
    throw ApiError.conflict("A payment prompt was just sent to your phone. Complete it, or wait a minute and try again.");
  }

  const push = await stkPush({
    phone,
    amountKes: order.totalCents / 100,
    accountReference: order.reference.slice(0, 12),
    description: "Tickets",
    callbackUrl: `${env.PUBLIC_API_URL}/api/v1/payments/callbacks/stk/${cfg.callbackSecret}`,
  });

  await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: "MPESA",
      providerRef: push.checkoutRequestId,
      status: "PENDING",
      amountCents: order.totalCents,
      currency: "KES",
      metadata: { merchantRequestId: push.merchantRequestId, phone: maskPhone(phone) },
    },
  });

  return { checkoutRequestId: push.checkoutRequestId, message: push.message };
}

// ------------------------------------------------------------- callback

const stkCallbackSchema = z.object({
  Body: z.object({
    stkCallback: z.object({
      CheckoutRequestID: z.string().min(1).max(100),
      ResultCode: z.coerce.number(),
      ResultDesc: z.string().max(500).optional(),
      CallbackMetadata: z
        .object({
          Item: z.array(z.object({ Name: z.string(), Value: z.union([z.string(), z.number()]).optional() })),
        })
        .optional(),
    }),
  }),
});

// Safaricom only needs a quick "200 OK". Anything unclear is logged and left for the reconciliation job.
export async function handleStkCallback(rawBody: unknown): Promise<void> {
  const parsed = stkCallbackSchema.safeParse(rawBody);
  if (!parsed.success) {
    logger.warn("Ignored a malformed STK callback");
    return;
  }
  const cb = parsed.data.Body.stkCallback;

  // We only accept callbacks for pushes we started ourselves.
  const payment = await prisma.payment.findFirst({
    where: { provider: "MPESA", providerRef: cb.CheckoutRequestID },
    include: { order: { select: { reference: true } } },
  });
  if (!payment) {
    logger.warn(`STK callback for unknown CheckoutRequestID ${cb.CheckoutRequestID}`);
    return;
  }

  // ---- customer cancelled, wrong PIN, no balance, timeout ... ----
  if (cb.ResultCode !== 0) {
    await handleWebhook({
      reference: payment.order.reference,
      status: "FAILED",
      provider: "MPESA",
      providerRef: cb.CheckoutRequestID,
      amountCents: payment.amountCents,
      currency: "KES",
      metadata: { resultCode: cb.ResultCode, reason: cb.ResultDesc ?? "The payment was not completed" },
    });
    return;
  }

  // ---- reported success: don't just trust the callback, ask Safaricom ----
  try {
    const check = await stkQuery(cb.CheckoutRequestID);
    if (check.state !== "success") {
      logger.warn(`STK callback said success but Safaricom reports "${check.state}" for ${cb.CheckoutRequestID}`);
      return;
    }
  } catch (err) {
    logger.warn({ err }, `Could not confirm ${cb.CheckoutRequestID}; the reconciliation job will retry`);
    return;
  }

  const item = (name: string) => cb.CallbackMetadata?.Item.find((i) => i.Name === name)?.Value;
  const paid = Number(item("Amount"));
  const receipt = item("MpesaReceiptNumber");

  await handleWebhook({
    reference: payment.order.reference,
    status: "SUCCEEDED",
    provider: "MPESA",
    providerRef: cb.CheckoutRequestID,
    amountCents: Number.isFinite(paid) && paid > 0 ? Math.round(paid * 100) : payment.amountCents,
    currency: "KES",
    metadata: { mpesaReceipt: receipt === undefined ? null : String(receipt) },
  });
}

// ------------------------------------------------------- reconciliation

const PROMPT_TIMEOUT_MS = 30 * 60_000;

// Runs every minute. Catches payments whose callback never arrived and closes prompts nobody answered.
export async function reconcileMpesaPayments(): Promise<number> {
  if (!env.mpesa) return 0;

  const now = Date.now();
  let changed = 0;

  const pending = await prisma.payment.findMany({
    where: {
      provider: "MPESA",
      status: "PENDING",
      createdAt: { lt: new Date(now - 45_000), gt: new Date(now - PROMPT_TIMEOUT_MS) },
    },
    include: { order: { select: { reference: true } } },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  for (const p of pending) {
    if (!p.providerRef) continue;
    try {
      const check = await stkQuery(p.providerRef);
      if (check.state === "pending") continue;

      await handleWebhook({
        reference: p.order.reference,
        status: check.state === "success" ? "SUCCEEDED" : "FAILED",
        provider: "MPESA",
        providerRef: p.providerRef,
        amountCents: p.amountCents,
        currency: "KES",
        metadata:
          check.state === "success"
            ? { reconciled: true }
            : { reconciled: true, resultCode: check.resultCode ?? null, reason: check.resultDesc ?? "The payment was not completed" },
      });
      changed++;
    } catch (err) {
      logger.error({ err }, `M-Pesa reconcile failed for ${p.providerRef}`);
    }
  }

  // Prompts still unanswered after 30 minutes are closed.
  try {
    const expired = await prisma.payment.updateMany({
      where: { provider: "MPESA", status: "PENDING", createdAt: { lt: new Date(now - PROMPT_TIMEOUT_MS) } },
      data: { status: "FAILED", metadata: { reason: "No response from the customer" } },
    });
    changed += expired.count;
  } catch (err) {
    if (!isUniqueViolation(err)) logger.error({ err }, "Could not close expired M-Pesa prompts");
  }

  return changed;
}
// ==========================================
// END OF FILE: backend/src/modules/payments/mpesa.service.ts
// ==========================================