// ==========================================
// FILE: backend/tests/payments.test.ts
// PURPOSE: Webhook security, idempotency, wrong amounts, double charges and late payments.
// ==========================================
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/config/database";
import { releaseExpiredOrders } from "../src/modules/orders/orders.service";
import {
  api,
  authHeader,
  createEventWithTicket,
  createSeller,
  createUser,
  mockWebhook,
  payOrder,
  placeOrder,
  resetDb,
} from "./helpers";

beforeEach(resetDb);

async function pendingOrder(opts: { stock?: number; quantity?: number } = {}) {
  const { profile } = await createSeller();
  const { ticket } = await createEventWithTicket({ sellerProfileId: profile.id, quantity: opts.stock ?? 5 });
  const buyer = await createUser("USER");
  const res = await placeOrder(buyer, [{ ticketTypeId: ticket.id, quantity: opts.quantity ?? 2 }]);
  expect(res.status).toBe(201);
  return { ticket, buyer, order: res.body.data as { id: string; reference: string; totalCents: number; currency: string } };
}

const expire = (orderId: string) =>
  prisma.order.update({ where: { id: orderId }, data: { reservationExpiresAt: new Date(Date.now() - 60_000) } });

describe("webhook security", () => {
  it("rejects a webhook with no signature or the wrong one", async () => {
    const { order } = await pendingOrder();
    const body = {
      reference: order.reference,
      status: "SUCCEEDED",
      providerRef: "forged_1",
      amountCents: order.totalCents,
      currency: order.currency,
    };

    expect((await api().post("/api/v1/payments/webhook").send(body)).status).toBe(401);
    expect((await mockWebhook(body, "wrong-secret")).status).toBe(401);

    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");
    expect(await prisma.ticket.count()).toBe(0);
  });
});

describe("settlement", () => {
  it("pays the order, issues one ticket per person and ignores a replay", async () => {
    const { order } = await pendingOrder({ quantity: 3 });

    const first = await payOrder(order, "pay_1");
    expect(first.status).toBe(200);
    expect(first.body.result).toBe("processed");

    const paid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paid.status).toBe("PAID");
    expect(paid.paidAt).not.toBeNull();
    expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(3);

    const replay = await payOrder(order, "pay_1");
    expect(replay.body.result).toBe("duplicate");
    expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(3);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("handles the same webhook arriving five times at once", async () => {
    const { order } = await pendingOrder({ quantity: 2 });

    const results = await Promise.all(Array.from({ length: 5 }, () => payOrder(order, "pay_race")));

    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.filter((r) => r.body.result === "processed")).toHaveLength(1);
    expect(results.filter((r) => r.body.result === "duplicate")).toHaveLength(4);

    expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(2);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("records a wrong amount for refund instead of issuing tickets", async () => {
    const { order } = await pendingOrder();

    const res = await mockWebhook({
      reference: order.reference,
      status: "SUCCEEDED",
      providerRef: "short_pay",
      amountCents: order.totalCents - 100,
      currency: order.currency,
    });

    expect(res.body.result).toBe("needs_refund");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");
    expect(await prisma.ticket.count()).toBe(0);

    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(payment.status).toBe("SUCCEEDED");
    expect(payment.metadata).toMatchObject({ needsRefund: true, reason: "amount_mismatch" });
  });

  it("flags a second payment on an order that is already paid", async () => {
    const { order } = await pendingOrder();

    expect((await payOrder(order, "first")).body.result).toBe("processed");
    expect((await payOrder(order, "second")).body.result).toBe("needs_refund");

    expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(2); // not doubled
    const flagged = await prisma.payment.findFirstOrThrow({ where: { providerRef: "second" } });
    expect(flagged.metadata).toMatchObject({ needsRefund: true, reason: "order_already_settled" });
  });

  it("keeps the order open after a failed payment so the buyer can try again", async () => {
    const { order } = await pendingOrder();

    const failed = await mockWebhook({
      reference: order.reference,
      status: "FAILED",
      providerRef: "declined_1",
      amountCents: order.totalCents,
      currency: order.currency,
    });
    expect(failed.body.result).toBe("failed_recorded");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");

    expect((await payOrder(order, "retry_ok")).body.result).toBe("processed");
  });

  it("accepts a late payment when the tickets are still free", async () => {
    const { ticket, order } = await pendingOrder({ stock: 1, quantity: 1 });

    await expire(order.id);
    await releaseExpiredOrders();
    expect((await prisma.ticketType.findUniqueOrThrow({ where: { id: ticket.id } })).sold).toBe(0);

    expect((await payOrder(order, "late_ok")).body.result).toBe("processed");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");
    expect((await prisma.ticketType.findUniqueOrThrow({ where: { id: ticket.id } })).sold).toBe(1);
    expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("sends a late payment to the refund queue when someone else bought the last ticket", async () => {
    const { ticket, order } = await pendingOrder({ stock: 1, quantity: 1 });

    await expire(order.id);
    await releaseExpiredOrders();

    const otherBuyer = await createUser("USER");
    expect((await placeOrder(otherBuyer, [{ ticketTypeId: ticket.id, quantity: 1 }])).status).toBe(201);

    expect((await payOrder(order, "late_lost")).body.result).toBe("needs_refund");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("EXPIRED");
    expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(0);

    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(payment.metadata).toMatchObject({ needsRefund: true, reason: "stock_unavailable_after_expiry" });
  });
});

describe("payment status", () => {
  it("shows the owner whether the order is paid, and hides it from everyone else", async () => {
    const { buyer, order } = await pendingOrder();
    const stranger = await createUser("USER");

    const before = await api().get(`/api/v1/payments/status/${order.id}`).set(authHeader(buyer));
    expect(before.body.data.paid).toBe(false);

    await payOrder(order);

    const after = await api().get(`/api/v1/payments/status/${order.id}`).set(authHeader(buyer));
    expect(after.body.data.paid).toBe(true);

    const hidden = await api().get(`/api/v1/payments/status/${order.id}`).set(authHeader(stranger));
    expect(hidden.status).toBe(404);
  });
});
// ==========================================
// END OF FILE: backend/tests/payments.test.ts
// ==========================================