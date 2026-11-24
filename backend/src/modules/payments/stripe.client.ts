// ==========================================
// FILE: backend/src/modules/payments/stripe.client.ts
// PURPOSE: The only file that talks to Stripe: creates hosted card checkouts, reads their result and checks webhook signatures.
// ==========================================
import Stripe from "stripe";
import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";
import { logger } from "../../utils/logger";

let client: Stripe | null = null;

function stripe(): Stripe {
  if (!env.stripe) throw ApiError.badRequest("Card payments are not available right now");
  client ??= new Stripe(env.stripe.secretKey, { maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: "Ticket Take It" } });
  return client;
}

// ---------------------------------------------------------------- amounts

// Everywhere else an amount is "cents": 1 shilling is 100. Stripe counts in the smallest unit of each currency,
// which is not always a hundredth. These lists follow Stripe's documentation.
const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "VND", "VUV", "XAF", "XOF", "XPF"]);
const THREE_DECIMAL = new Set(["BHD", "JOD", "KWD", "OMR", "TND"]);

export function toStripeAmount(cents: number, currency: string): number {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL.has(code)) return Math.round(cents / 100);
  if (THREE_DECIMAL.has(code)) return cents * 10;
  return cents;
}

export function fromStripeAmount(amount: number, currency: string): number {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL.has(code)) return amount * 100;
  if (THREE_DECIMAL.has(code)) return Math.round(amount / 10);
  return amount;
}

// ---------------------------------------------------------------- checkout

// Stripe will not accept a checkout that lasts less than 30 minutes. A payment that lands after the
// ticket hold ran out is handled by the settlement (stock is claimed again, or the money is flagged for a refund).
const SESSION_LIFETIME_SECONDS = 31 * 60;

export async function createCheckoutSession(input: {
  orderId: string;
  orderReference: string;
  amountCents: number;
  currency: string;
  email: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string }> {
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe().checkout.sessions.create({
      mode: "payment",
      client_reference_id: input.orderReference,
      customer_email: input.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: toStripeAmount(input.amountCents, input.currency),
            product_data: { name: `Ticket Take It order ${input.orderReference}` },
          },
        },
      ],
      metadata: { orderId: input.orderId, orderReference: input.orderReference },
      payment_intent_data: { metadata: { orderId: input.orderId, orderReference: input.orderReference } },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      expires_at: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS,
    });
  } catch (err) {
    logger.warn({ err }, "Stripe did not start the checkout");
    // For example a currency Stripe does not support, or an amount below its minimum.
    if (err instanceof Stripe.errors.StripeInvalidRequestError) {
      throw ApiError.badRequest("Card payment is not available for this order. Please choose another payment method.");
    }
    if (err instanceof Stripe.errors.StripeConnectionError || err instanceof Stripe.errors.StripeAPIError) {
      throw ApiError.serviceUnavailable("Card payments are temporarily unavailable. Please try again in a moment.");
    }
    throw err;
  }

  if (!session.url) throw ApiError.internal("Stripe did not return a checkout link");
  return { id: session.id, url: session.url };
}

export interface CheckoutSessionResult {
  id: string;
  status: string | null; // "open", "complete" or "expired"
  paymentStatus: string; // "paid", "unpaid" or "no_payment_required"
  amountCents: number;
  currency: string; // upper case
  paymentIntentId: string | null;
}

// Asks Stripe what really happened. The webhook only tells us WHERE to look. Stripe's answer decides.
export async function retrieveCheckoutSession(sessionId: string): Promise<CheckoutSessionResult | null> {
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe().checkout.sessions.retrieve(sessionId);
  } catch (err) {
    if (err instanceof Stripe.errors.StripeInvalidRequestError && err.statusCode === 404) return null;
    throw err;
  }

  const currency = (session.currency ?? "").toUpperCase();
  return {
    id: session.id,
    status: session.status,
    paymentStatus: session.payment_status,
    amountCents: fromStripeAmount(session.amount_total ?? 0, currency),
    currency,
    paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null),
  };
}

// ---------------------------------------------------------------- webhooks

// Stripe signs the exact bytes it sends. A wrong or missing signature (or a body that was changed) throws.
export function verifyStripeEvent(rawBody: Buffer, signature: string | undefined): Stripe.Event {
  if (!env.stripe) throw ApiError.badRequest("Card payments are not available right now");
  if (!signature) throw ApiError.unauthorized("Missing signature");

  try {
    return stripe().webhooks.constructEvent(rawBody, signature, env.stripe.webhookSecret);
  } catch {
    throw ApiError.unauthorized("Invalid signature");
  }
}
// ==========================================
// END OF FILE: backend/src/modules/payments/stripe.client.ts
// ==========================================