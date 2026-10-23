// ==========================================
// FILE: backend/src/modules/payments/mpesa.client.ts
// PURPOSE: Low-level calls to the Safaricom Daraja API.
// ==========================================
import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";
import { logger } from "../../utils/logger";

function requireMpesa() {
  if (!env.mpesa) throw ApiError.badRequest("M-Pesa is not available right now");
  return env.mpesa;
}

const baseUrl = (mode: "sandbox" | "production") =>
  mode === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";

const asString = (v: unknown): string | undefined =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined;

async function daraja(path: string, init: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  const cfg = requireMpesa();
  try {
    const res = await fetch(`${baseUrl(cfg.env)}${path}`, { ...init, signal: AbortSignal.timeout(15_000) });
    const text = await res.text();

    let body: Record<string, unknown> = {};
    try {
      const parsed: unknown = text ? JSON.parse(text) : {};
      if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
    } catch {
      body = { raw: text.slice(0, 200) };
    }
    return { status: res.status, body };
  } catch (err) {
    logger.error({ err }, "Daraja request failed");
    throw ApiError.serviceUnavailable("M-Pesa is temporarily unavailable. Please try again shortly.");
  }
}

// ---- access token (cached until just before it expires) ----
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;

  const cfg = requireMpesa();
  const basic = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString("base64");
  const { status, body } = await daraja("/oauth/v1/generate?grant_type=client_credentials", {
    method: "GET",
    headers: { Authorization: `Basic ${basic}` },
  });

  const token = asString(body.access_token);
  if (status !== 200 || !token) {
    logger.error({ status }, "Could not get a Daraja access token. Check the consumer key and secret.");
    throw ApiError.serviceUnavailable("M-Pesa is temporarily unavailable. Please try again shortly.");
  }

  const ttlSeconds = Number(body.expires_in) || 3599;
  cachedToken = { token, expiresAt: Date.now() + ttlSeconds * 1000 };
  return token;
}

// Daraja wants YYYYMMDDHHmmss. Nairobi time is UTC+3.
function timestamp(): string {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

const password = (shortcode: string, passkey: string, ts: string) =>
  Buffer.from(`${shortcode}${passkey}${ts}`).toString("base64");

// ---- STK push (the payment prompt on the customer's phone) ----
export interface StkPushArgs {
  phone: string; // 2547XXXXXXXX
  amountKes: number; // whole shillings
  accountReference: string; // max 12 characters
  description: string; // max 13 characters
  callbackUrl: string;
}

export async function stkPush(args: StkPushArgs) {
  const cfg = requireMpesa();
  const token = await getAccessToken();
  const ts = timestamp();

  const { status, body } = await daraja("/mpesa/stkpush/v1/processrequest", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: cfg.shortcode,
      Password: password(cfg.shortcode, cfg.passkey, ts),
      Timestamp: ts,
      TransactionType: cfg.transactionType,
      Amount: args.amountKes,
      PartyA: args.phone,
      PartyB: cfg.tillNumber ?? cfg.shortcode,
      PhoneNumber: args.phone,
      CallBackURL: args.callbackUrl,
      AccountReference: args.accountReference,
      TransactionDesc: args.description,
    }),
  });

  const checkoutRequestId = asString(body.CheckoutRequestID);
  if (status !== 200 || asString(body.ResponseCode) !== "0" || !checkoutRequestId) {
    logger.error({ status, body }, "STK push was rejected by Daraja");
    throw ApiError.badRequest("Could not send the M-Pesa prompt. Check the phone number and try again.");
  }

  return {
    checkoutRequestId,
    merchantRequestId: asString(body.MerchantRequestID) ?? "",
    message: asString(body.CustomerMessage) ?? "Check your phone to complete the payment",
  };
}

// ---- STK query (asks Safaricom what happened to a push) ----
export interface StkQueryResult {
  state: "success" | "failed" | "pending";
  resultCode?: number;
  resultDesc?: string;
}

export async function stkQuery(checkoutRequestId: string): Promise<StkQueryResult> {
  const cfg = requireMpesa();
  const token = await getAccessToken();
  const ts = timestamp();

  const { status, body } = await daraja("/mpesa/stkpushquery/v1/query", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: cfg.shortcode,
      Password: password(cfg.shortcode, cfg.passkey, ts),
      Timestamp: ts,
      CheckoutRequestID: checkoutRequestId,
    }),
  });

  if (status === 200 && body.ResultCode !== undefined) {
    const resultCode = Number(body.ResultCode);
    return {
      state: resultCode === 0 ? "success" : "failed",
      resultCode,
      resultDesc: asString(body.ResultDesc),
    };
  }

  // While the customer is still deciding, Daraja answers with an error that means "still processing".
  if (asString(body.errorCode) === "500.001.1001") return { state: "pending" };

  logger.warn({ status, body }, "Unexpected STK query response");
  throw ApiError.serviceUnavailable("Could not check the M-Pesa payment");
}
// ==========================================
// END OF FILE: backend/src/modules/payments/mpesa.client.ts
// ==========================================