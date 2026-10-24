// ==========================================
// FILE: backend/src/modules/payments/paystack.client.ts
// PURPOSE: Low-level calls to the Paystack API and webhook signature check.
// ==========================================
import { createHmac } from "crypto";
import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";
import { logger } from "../../utils/logger";
import { safeEqual } from "../../utils/safeEqual";

const BASE_URL = "https://api.paystack.co";

function requirePaystack() {
  if (!env.paystack) throw ApiError.badRequest("Online payments are not available right now");
  return env.paystack;
}

const asString = (v: unknown): string | undefined =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined;

const asNumber = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
};

const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

async function paystackRequest(
  method: "GET" | "POST",
  path: string,
  payload?: unknown
): Promise<{ status: number; body: Record<string, unknown> }> {
  const cfg = requirePaystack();
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${cfg.secretKey}`, "Content-Type": "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();

    let body: Record<string, unknown> = {};
    try {
      body = asObject(text ? JSON.parse(text) : {});
    } catch {
      body = { raw: text.slice(0, 200) };
    }
    return { status: res.status, body };
  } catch (err) {
    logger.error({ err }, "Paystack request failed");
    throw ApiError.serviceUnavailable("The payment service is temporarily unavailable. Please try again shortly.");
  }
}

// Paystack signs the exact bytes it sends with HMAC-SHA512 and your secret key.
export function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  const cfg = env.paystack;
  if (!cfg) return false;
  const expected = createHmac("sha512", cfg.secretKey).update(rawBody).digest("hex");
  return safeEqual(signature.trim().toLowerCase(), expected);
}

// ---- start a checkout ----
export async function initializeTransaction(args: {
  email: string;
  amountCents: number; // Paystack wants the smallest unit of the currency, which is how we store prices
  currency: string;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, string>;
}) {
  const { status, body } = await paystackRequest("POST", "/transaction/initialize", {
    email: args.email,
    amount: args.amountCents,
    currency: args.currency,
    reference: args.reference,
    callback_url: args.callbackUrl,
    metadata: args.metadata,
  });

  const data = asObject(body.data);
  const authorizationUrl = asString(data.authorization_url);

  if (status !== 200 || body.status !== true || !authorizationUrl) {
    logger.error({ status, message: asString(body.message) }, "Paystack rejected the transaction");
    throw ApiError.badRequest("Could not start the payment. Please try again.");
  }

  return { authorizationUrl, accessCode: asString(data.access_code) ?? null };
}

// ---- ask Paystack what really happened ----
export interface PaystackTransaction {
  id: string;
  status: string; // success, failed, abandoned, ongoing, pending, processing, queued, reversed
  reference: string;
  amountCents: number;
  currency: string;
  channel: string | null;
  gatewayResponse: string | null;
}

// Returns null when Paystack has no record of the reference yet (the customer never opened the checkout).
export async function verifyTransaction(reference: string): Promise<PaystackTransaction | null> {
  const { status, body } = await paystackRequest("GET", `/transaction/verify/${encodeURIComponent(reference)}`);
  if (status === 404) return null;

  const data = asObject(body.data);
  const txStatus = asString(data.status);
  const amountCents = asNumber(data.amount);

  if (status === 200 && body.status === true && txStatus && amountCents !== undefined) {
    return {
      id: asString(data.id) ?? "",
      status: txStatus,
      reference: asString(data.reference) ?? reference,
      amountCents,
      currency: (asString(data.currency) ?? "").toUpperCase(),
      channel: asString(data.channel) ?? null,
      gatewayResponse: asString(data.gateway_response) ?? null,
    };
  }

  if (/not found/i.test(asString(body.message) ?? "")) return null;

  logger.warn({ status, message: asString(body.message) }, "Unexpected Paystack verify response");
  throw ApiError.serviceUnavailable("Could not check the payment status");
}

// ---- refund the full amount ----
export async function refundTransaction(reference: string, note?: string) {
  const { status, body } = await paystackRequest("POST", "/refund", {
    transaction: reference,
    ...(note && { merchant_note: note }),
  });

  const data = asObject(body.data);
  const refundStatus = asString(data.status) ?? "pending";

  if ((status !== 200 && status !== 201) || body.status !== true) {
    throw ApiError.badRequest(asString(body.message) ?? "Paystack refused the refund");
  }
  if (refundStatus === "failed" || refundStatus === "needs-attention") {
    throw ApiError.badRequest(`Paystack could not complete the refund (${refundStatus})`);
  }

  return { id: asString(data.id) ?? null, status: refundStatus };
}
// ==========================================
// END OF FILE: backend/src/modules/payments/paystack.client.ts
// ==========================================