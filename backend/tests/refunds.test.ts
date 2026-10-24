// ==========================================
// FILE: backend/tests/refunds.test.ts
// PURPOSE: Order refunds, the needs-refund queue, and what happens when an event is cancelled.
// ==========================================
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/config/database";
import {
  api,
  authHeader,
  createEventWithTicket,
  createSeller,
  createUser,
  payOrder,
  placeOrder,
  resetDb,
  setupPaidOrder,
} from "./helpers";

beforeEach(resetDb);

describe("refunding an order", () => {
  it("voids the tickets, returns the stock and queues the money for a manual refund", async () => {
    const { order, ticket } = await setupPaidOrder({ quantity: 2, stock: 5 });
    const admin = await createUser("ADMIN");

    const res = await api().post(`/api/v1/admin/orders/${order.id}/refund`).set(authHeader(admin)).send({ reason: "Customer asked" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("REFUNDED");
    expect(res.body.data.manualRefundRequired).toBe(true); // mock payments are not refunded automatically

    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("REFUNDED");
    expect(await prisma.ticket.count({ where: { orderId: order.id, status: "VOID" } })).toBe(2);
    expect((await prisma.ticketType.findUniqueOrThrow({ where: { id: ticket.id } })).sold).toBe(0);

    // The money shows up in the queue until someone confirms it was returned.
    const queue = await api().get("/api/v1/admin/payments/needs-refund").set(authHeader(admin));
    expect(queue.body.data).toHaveLength(1);

    const paymentId = queue.body.data[0].id as string;
    const resolved = await api()
      .post(`/api/v1/admin/payments/${paymentId}/resolve-refund`)
      .set(authHeader(admin))
      .send({ note: "Returned by M-Pesa reversal" });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.status).toBe("REFUNDED");

    const after = await api().get("/api/v1/admin/payments/needs-refund").set(authHeader(admin));
    expect(after.body.data).toHaveLength(0);
  });

  it("only lets admins refund", async () => {
    const { order, buyer, sellerUser } = await setupPaidOrder();

    expect((await api().post(`/api/v1/admin/orders/${order.id}/refund`).set(authHeader(buyer)).send({})).status).toBe(403);
    expect((await api().post(`/api/v1/admin/orders/${order.id}/refund`).set(authHeader(sellerUser)).send({})).status).toBe(403);
  });

  it("cannot refund twice, or after a ticket was used at the door", async () => {
    const { order } = await setupPaidOrder();
    const admin = await createUser("ADMIN");
    const refund = () => api().post(`/api/v1/admin/orders/${order.id}/refund`).set(authHeader(admin)).send({});

    await prisma.ticket.updateMany({ where: { orderId: order.id }, data: { status: "USED", usedAt: new Date() } });
    expect((await refund()).status).toBe(409);

    await prisma.ticket.updateMany({ where: { orderId: order.id }, data: { status: "VALID", usedAt: null } });
    expect((await refund()).status).toBe(200);
    expect((await refund()).status).toBe(400); // already refunded
  });
});

describe("cancelling an event", () => {
  it("voids tickets, releases unpaid orders, and lets an admin refund every paid order", async () => {
    const seller = await createSeller();
    const { event, ticket } = await createEventWithTicket({ sellerProfileId: seller.profile.id, quantity: 10 });
    const admin = await createUser("ADMIN");

    const paidBuyer = await createUser("USER");
    const paidOrder = (await placeOrder(paidBuyer, [{ ticketTypeId: ticket.id, quantity: 2 }])).body.data;
    await payOrder(paidOrder);

    const unpaidBuyer = await createUser("USER");
    const unpaidOrder = (await placeOrder(unpaidBuyer, [{ ticketTypeId: ticket.id, quantity: 3 }])).body.data;

    const cancelled = await api().post(`/api/v1/events/${event.id}/cancel`).set(authHeader(seller.user));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.event.status).toBe("CANCELLED");
    expect(cancelled.body.data.paidOrdersToRefund).toBe(1);

    expect(await prisma.ticket.count({ where: { orderId: paidOrder.id, status: "VOID" } })).toBe(2);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: unpaidOrder.id } })).status).toBe("CANCELLED");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: paidOrder.id } })).status).toBe("PAID");

    // Nobody can buy any more.
    const late = await placeOrder(await createUser("USER"), [{ ticketTypeId: ticket.id, quantity: 1 }]);
    expect(late.status).toBe(400);

    const bulk = await api().post(`/api/v1/admin/events/${event.id}/refund-orders`).set(authHeader(admin)).send({});
    expect(bulk.status).toBe(200);
    expect(bulk.body.data.refunded).toBe(1);
    expect(bulk.body.data.remaining).toBe(0);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: paidOrder.id } })).status).toBe("REFUNDED");

    const again = await api().post(`/api/v1/admin/events/${event.id}/refund-orders`).set(authHeader(admin)).send({});
    expect(again.body.data.refunded).toBe(0);
  });

  it("refuses to bulk-refund an event that was not cancelled", async () => {
    const seller = await createSeller();
    const { event } = await createEventWithTicket({ sellerProfileId: seller.profile.id });
    const admin = await createUser("ADMIN");

    const res = await api().post(`/api/v1/admin/events/${event.id}/refund-orders`).set(authHeader(admin)).send({});
    expect(res.status).toBe(400);
  });
});
// ==========================================
// END OF FILE: backend/tests/refunds.test.ts
// ==========================================