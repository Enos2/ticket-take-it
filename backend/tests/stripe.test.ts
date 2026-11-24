// ==========================================
// FILE: backend/tests/stripe.test.ts
// PURPOSE: Stripe card payments: amounts, signed webhooks, settlement, replays and mismatches. Stripe's API is mocked.
// ==========================================
import { randomBytes } from "crypto";
import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

// These run BEFORE the app is loaded, so the app starts with Stripe switched on.
const stripeApi = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_vitest_stripe_key_000000";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_vitest_webhook_secret_000000";
  return { createCheckoutSession: vi.fn(), retrieveCheckoutSession: vi.fn() };
});

// Only the two functions that call Stripe's servers are replaced. Amount conversion and signature checks stay real.
vi.mock("../src/modules/payments/stripe.client", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/modules/payments/stripe.client")>();
  return { ...real, createCheckoutSession: stripeApi.createCheckoutSession, retrieveCheckoutSession: stripeApi.retrieveCheckoutSession };
});

import { prisma } from "../src/config/database";
import { fromStripeAmount, toStripeAmount } from "../src/modules/payments/stripe.client";
import { api, authHeader, createEventWithTicket, createSeller, createUser, placeOrder, resetDb } from "./helpers";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const signer = new Stripe("sk_test_unused_signer_key");

// What the fake Stripe will answer when the app asks "what happened to this checkout?"
const session = { status: "complete", paymentStatus: "paid", amountCents: 0, currency: "KES", paymentIntentId: "pi_test_123" };

beforeEach(async () => {
  await resetDb();
  stripeApi.createCheckoutSession.mockReset();
  stripeApi.retrieveCheckoutSession.mockReset();
  session.status = "complete";
  session.paymentStatus = "paid";
  session.currency = "KES";

  stripeApi.createCheckoutSession.mockImplementation(async () => ({ id: `cs_test_${randomBytes(6).toString("hex")}`, url: "https://checkout.stripe.com/c/pay/cs_test_abc" }));
  stripeApi.retrieveCheckoutSession.mockImplementation(async (id: string) => ({ id, ...session }));
});

const sign = (payload: string) => signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });

function eventBody(type: string, sessionId: string) {
  return JSON.stringify({
    id: `evt_${randomBytes(6).toString("hex")}`,
    object: "event",
    api_version: "2026-11-18.endive",
    created: Math.floor(Date.now() / 1000),
    type,
    data: { object: { id: sessionId, object: "checkout.session" } },
  });
}

function sendEvent(payload: string, signature?: string | null) {
  const req = api().post("/api/v1/payments/callbacks/stripe").set("content-type", "application/json");
  if (signature !== null) req.set("stripe-signature", signature ?? sign(payload));
  return req.send(payload);
}

// A buyer with an unpaid order and an open Stripe checkout.
async function checkout() {
  const { profile } = await createSeller();
  const { ticket } = await createEventWithTicket({ sellerProfileId: profile.id, quantity: 10, priceCents: 50_000 });
  const buyer = await createUser("USER");

  const created = await placeOrder(buyer, [{ ticketTypeId: ticket.id, quantity: 2 }]);
  expect(created.status).toBe(201);
  const order = created.body.data as { id: string; reference: string; totalCents: number };

  const init = await api().post(`/api/v1/payments/initialize/${order.id}`).set(authHeader(buyer)).send({ provider: "STRIPE" });
  expect(init.status).toBe(200);
  expect(init.body.data.checkoutUrl).toBe("https://checkout.stripe.com/c/pay/cs_test_abc");

  const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id, provider: "STRIPE" } });
  session.amountCents = order.totalCents;

  return { buyer, order, payment, sessionId: payment.providerRef as string };
}

describe("amounts", () => {
  it("converts cents to the smallest unit each currency uses, and back", () => {
    expect(toStripeAmount(150_000, "KES")).toBe(150_000); // shillings have cents
    expect(toStripeAmount(2_500, "usd")).toBe(2_500);
    expect(toStripeAmount(150_000, "JPY")).toBe(1_500); // yen have no cents
    expect(toStripeAmount(1_500, "KWD")).toBe(15_000); // dinars have three decimals

    for (const [amount, currency] of [[150_000, "KES"], [150_000, "JPY"], [1_500, "KWD"]] as const) {
      expect(fromStripeAmount(toStripeAmount(amount, currency), currency)).toBe(amount);
    }
  });
});

describe("starting a checkout", () => {
  it("offers card payment only when Stripe is set up", async () => {
    const res = await api().get("/api/v1/payments/methods");
    expect(res.status).toBe(200);
    expect(res.body.data.stripe).toBe(true);
  });

  it("creates a pending Stripe payment and reuses the open checkout on a second click", async () => {
    const { buyer, order, sessionId } = await checkout();

    expect(sessionId).toMatch(/^cs_test_/);
    expect(stripeApi.createCheckoutSession).toHaveBeenCalledTimes(1);
    expect(stripeApi.createCheckoutSession.mock.calls[0][0]).toMatchObject({ orderReference: order.reference, amountCents: order.totalCents, currency: "KES" });

    const again = await api().post(`/api/v1/payments/initialize/${order.id}`).set(authHeader(buyer)).send({ provider: "STRIPE" });
    expect(again.status).toBe(200);
    expect(stripeApi.createCheckoutSession).toHaveBeenCalledTimes(1); // no second checkout
    expect(await prisma.payment.count({ where: { orderId: order.id, provider: "STRIPE" } })).toBe(1);
  });
});

describe("the webhook", () => {
  it("refuses an event with a wrong, missing or tampered signature", async () => {
    const { order, sessionId } = await checkout();
    const payload = eventBody("checkout.session.completed", sessionId);

    expect((await sendEvent(payload, "t=1,v1=deadbeef")).status).toBe(401);
    expect((await sendEvent(payload, null)).status).toBe(401);
    expect((await sendEvent(payload + " ", sign(payload))).status).toBe(401); // changed after signing

    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");
    expect(stripeApi.retrieveCheckoutSession).not.toHaveBeenCalled();
  });

  it("pays the order and issues the tickets when Stripe says it was paid", async () => {
    const { order, sessionId } = await checkout();

    const res = await sendEvent(eventBody("checkout.session.completed", sessionId));
    expect(res.status).toBe(200);

    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");
    expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(2);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: (await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } })).id } })).status).toBe("SUCCEEDED");
  });

  it("is safe when Stripe delivers the same event twice, or both event types", async () => {
    const { order, sessionId } = await checkout();
    const payload = eventBody("checkout.session.completed", sessionId);

    expect((await sendEvent(payload)).status).toBe(200);
    expect((await sendEvent(payload)).status).toBe(200);
    expect((await sendEvent(eventBody("checkout.session.async_payment_succeeded", sessionId))).status).toBe(200);

    expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(2); // never more than two
    expect(await prisma.payment.count({ where: { orderId: order.id, status: "SUCCEEDED" } })).toBe(1);
  });

  it("does not pay the order while the money has not arrived", async () => {
    const { order, sessionId } = await checkout();
    session.status = "complete";
    session.paymentStatus = "unpaid"; // a slow payment method still waiting

    expect((await sendEvent(eventBody("checkout.session.completed", sessionId))).status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");
  });

  it("takes Stripe's word over the event: an event for a payment Stripe says is unpaid changes nothing", async () => {
    const { order, sessionId } = await checkout();
    session.status = "open";
    session.paymentStatus = "unpaid";

    await sendEvent(eventBody("checkout.session.completed", sessionId));
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");
    expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("flags money for a refund instead of issuing tickets when the amount is wrong", async () => {
    const { order, sessionId } = await checkout();
    session.amountCents = order.totalCents - 100; // underpaid

    expect((await sendEvent(eventBody("checkout.session.completed", sessionId))).status).toBe(200);

    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).not.toBe("PAID");
    expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(0);
    const payments = await prisma.payment.findMany({ where: { orderId: order.id } });
    expect(payments.some((p) => (p.metadata as { needsRefund?: boolean } | null)?.needsRefund === true)).toBe(true);
  });

  it("flags money for a refund when it is paid in a different currency", async () => {
    const { order, sessionId } = await checkout();
    session.currency = "USD";

    await sendEvent(eventBody("checkout.session.completed", sessionId));

    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).not.toBe("PAID");
    const payments = await prisma.payment.findMany({ where: { orderId: order.id } });
    expect(payments.some((p) => (p.metadata as { needsRefund?: boolean } | null)?.needsRefund === true)).toBe(true);
  });

  it("marks an expired checkout as failed and keeps the order open for another try", async () => {
    const { order, sessionId } = await checkout();
    session.status = "expired";
    session.paymentStatus = "unpaid";

    expect((await sendEvent(eventBody("checkout.session.expired", sessionId))).status).toBe(200);

    expect((await prisma.payment.findFirstOrThrow({ where: { orderId: order.id, providerRef: sessionId } })).status).toBe("FAILED");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");
  });

  it("ignores checkouts that are not ours and event types it does not use", async () => {
    expect((await sendEvent(eventBody("checkout.session.completed", "cs_test_someone_elses"))).status).toBe(200);
    expect(stripeApi.retrieveCheckoutSession).not.toHaveBeenCalled();
    expect((await sendEvent(eventBody("customer.created", "cus_test_1"))).status).toBe(200);
  });
});

describe("the status check the checkout page polls", () => {
  it("settles a paid checkout even if the webhook never arrives", async () => {
    const { buyer, order, payment } = await checkout();
    await prisma.payment.update({ where: { id: payment.id }, data: { createdAt: new Date(Date.now() - 60_000) } }); // older than the 3 second grace period

    const res = await api().get(`/api/v1/payments/status/${order.id}`).set(authHeader(buyer));

    expect(res.status).toBe(200);
    expect(res.body.data.paid).toBe(true);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");
  });
});
// ==========================================
// END OF FILE: backend/tests/stripe.test.ts
// ==========================================