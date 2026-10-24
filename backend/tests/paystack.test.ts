// ==========================================
// FILE: backend/tests/paystack.test.ts
// PURPOSE: Paystack checkout, signed webhooks, status polling and refunds. Paystack's API is mocked.
// ==========================================
import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/config/database";
import {
  api,
  authHeader,
  createEventWithTicket,
  createSeller,
  createUser,
  placeOrder,
  resetDb,
} from "./helpers";

const SECRET = process.env.PAYSTACK_SECRET_KEY ?? "";

// What the fake Paystack will answer when the app asks "what happened to this payment?"
const verify = { status: "success", amount: 0, currency: "KES", gatewayResponse: "Successful" };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(async () => {
  await resetDb();
  verify.status = "success";
  verify.currency = "KES";
  verify.gatewayResponse = "Successful";

  // supertest talks to the app over http, so replacing global fetch only affects calls the app makes to Paystack.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);

      if (url.endsWith("/transaction/initialize")) {
        return json({
          status: true,
          message: "Authorization URL created",
          data: { authorization_url: "https://checkout.paystack.com/test123", access_code: "test123", reference: "ignored" },
        });
      }
      if (url.includes("/transaction/verify/")) {
        return json({
          status: true,
          data: {
            id: 987,
            status: verify.status,
            reference: decodeURIComponent(url.split("/verify/")[1] ?? ""),
            amount: verify.amount,
            currency: verify.currency,
            channel: "card",
            gateway_response: verify.gatewayResponse,
          },
        });
      }
      if (url.endsWith("/refund")) return json({ status: true, data: { id: 55, status: "pending" } });

      return json({ status: false, message: "unexpected call" }, 500);
    })
  );
});

afterEach(() => vi.unstubAllGlobals());

const sign = (raw: string) => createHmac("sha512", SECRET).update(raw).digest("hex");

function sendWebhook(event: object, signature?: string | null) {
  const raw = JSON.stringify(event);
  const req = api().post("/api/v1/payments/callbacks/paystack").set("content-type", "application/json");
  if (signature !== null) req.set("x-paystack-signature", signature ?? sign(raw));
  return req.send(raw);
}

// A buyer with an unpaid order and an open Paystack checkout.
async function checkout() {
  const { profile } = await createSeller();
  const { ticket } = await createEventWithTicket({ sellerProfileId: profile.id, quantity: 10, priceCents: 50_000 });
  const buyer = await createUser("USER");

  const created = await placeOrder(buyer, [{ ticketTypeId: ticket.id, quantity: 2 }]);
  expect(created.status).toBe(201);
  const order = created.body.data as { id: string; reference: string; totalCents: number };

  const init = await api()
    .post(`/api/v1/payments/initialize/${order.id}`)
    .set(authHeader(buyer))
    .send({ provider: "PAYSTACK" });
  expect(init.status).toBe(200);
  expect(init.body.data.authorizationUrl).toBe("https://checkout.paystack.com/test123");

  const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id, provider: "PAYSTACK" } });
  verify.amount = order.totalCents;

  return { buyer, order, payment, reference: payment.providerRef as string };
}

describe("starting a checkout", () => {
  it("creates a pending payment and reuses the same checkout on a double click", async () => {
    const { buyer, order } = await checkout();

    const again = await api()
      .post(`/api/v1/payments/initialize/${order.id}`)
      .set(authHeader(buyer))
      .send({ provider: "PAYSTACK" });

    expect(again.status).toBe(200);
    expect(await prisma.payment.count({ where: { orderId: order.id, provider: "PAYSTACK" } })).toBe(1);
  });

  it("does not let someone else start a payment for your order", async () => {
    const { order } = await checkout();
    const stranger = await createUser("USER");

    const res = await api()
      .post(`/api/v1/payments/initialize/${order.id}`)
      .set(authHeader(stranger))
      .send({ provider: "PAYSTACK" });

    expect(res.status).toBe(404);
  });
});

describe("webhook", () => {
  it("rejects a missing or wrong signature", async () => {
    const { reference } = await checkout();
    const event = { event: "charge.success", data: { reference } };

    expect((await sendWebhook(event, null)).status).toBe(401);
    expect((await sendWebhook(event, "deadbeef")).status).toBe(401);
  });

  it("pays the order after a correctly signed charge.success, and ignores a replay", async () => {
    const { order, reference } = await checkout();
    const event = { event: "charge.success", data: { reference } };

    expect((await sendWebhook(event)).status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");
    expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(2);

    expect((await sendWebhook(event)).status).toBe(200);
    expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(2);
  });

  it("does not trust the webhook alone: Paystack's own answer decides", async () => {
    const { order, reference } = await checkout();
    verify.status = "abandoned"; // the webhook claims success, Paystack says the customer never paid

    expect((await sendWebhook({ event: "charge.success", data: { reference } })).status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");
    expect(await prisma.ticket.count()).toBe(0);
  });

  it("flags a payment whose amount does not match the order", async () => {
    const { order, reference } = await checkout();
    verify.amount = 100;

    expect((await sendWebhook({ event: "charge.success", data: { reference } })).status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");

    const payment = await prisma.payment.findFirstOrThrow({ where: { providerRef: reference } });
    expect(payment.status).toBe("SUCCEEDED");
    expect(payment.metadata).toMatchObject({ needsRefund: true, reason: "amount_mismatch" });
  });

  it("ignores references that belong to another app on the same Paystack account", async () => {
    const res = await sendWebhook({ event: "charge.success", data: { reference: "someone-elses-ref" } });
    expect(res.status).toBe(200);
    expect(await prisma.payment.count()).toBe(0);
  });
});

describe("status polling", () => {
  it("settles the payment without any webhook when the customer returns", async () => {
    const { buyer, order, payment } = await checkout();

    // The poller waits a few seconds after checkout starts, so pretend those seconds passed.
    await prisma.payment.update({ where: { id: payment.id }, data: { createdAt: new Date(Date.now() - 10_000) } });

    const res = await api().get(`/api/v1/payments/status/${order.id}`).set(authHeader(buyer));

    expect(res.body.data.paid).toBe(true);
    expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(2);
  });

  it("reports a failed payment with a reason", async () => {
    const { buyer, order, payment } = await checkout();
    verify.status = "failed";
    verify.gatewayResponse = "Declined by bank";
    await prisma.payment.update({ where: { id: payment.id }, data: { createdAt: new Date(Date.now() - 10_000) } });

    const res = await api().get(`/api/v1/payments/status/${order.id}`).set(authHeader(buyer));

    expect(res.body.data.paid).toBe(false);
    expect(res.body.data.paymentStatus).toBe("FAILED");
    expect(res.body.data.failureReason).toBe("Declined by bank");
  });
});

describe("refunds", () => {
  it("refunds a Paystack payment automatically when an admin refunds the order", async () => {
    const { order, reference } = await checkout();
    await sendWebhook({ event: "charge.success", data: { reference } });

    const admin = await createUser("ADMIN");
    const res = await api().post(`/api/v1/admin/orders/${order.id}/refund`).set(authHeader(admin)).send({});

    expect(res.status).toBe(200);
    expect(res.body.data.manualRefundRequired).toBe(false);
    expect(res.body.data.payments[0].outcome).toBe("refunded");

    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("REFUNDED");
    expect((await prisma.payment.findFirstOrThrow({ where: { providerRef: reference } })).status).toBe("REFUNDED");
    expect(await prisma.ticket.count({ where: { orderId: order.id, status: "VOID" } })).toBe(2);
  });
});
// ==========================================
// END OF FILE: backend/tests/paystack.test.ts
// ==========================================