// ==========================================
// FILE: backend/tests/orders.test.ts
// PURPOSE: Overselling protection, ticket rules, free tickets and reservation holds.
// ==========================================
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/config/database";
import { releaseExpiredOrders } from "../src/modules/orders/orders.service";
import { api, authHeader, createEventWithTicket, createSeller, createUser, inDays, placeOrder, resetDb } from "./helpers";

beforeEach(resetDb);

describe("overselling protection", () => {
  it("never sells more tickets than exist when many buyers act at the same moment", async () => {
    const { profile } = await createSeller();
    const { ticket } = await createEventWithTicket({ sellerProfileId: profile.id, quantity: 10 });
    const buyers = await Promise.all(Array.from({ length: 25 }, () => createUser("USER")));

    const results = await Promise.all(
      buyers.map((buyer) => placeOrder(buyer, [{ ticketTypeId: ticket.id, quantity: 1 }]))
    );

    const succeeded = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status !== 201);

    expect(succeeded).toHaveLength(10);
    // Everyone else is told "sold out" (400). Any 500 here would mean a real crash, not a sold-out answer.
    expect(rejected.every((r) => r.status === 400)).toBe(true);

    const fresh = await prisma.ticketType.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(fresh.sold).toBe(10);
    expect(await prisma.order.count()).toBe(10);
  });

  it("does not let one buyer dodge a group limit by splitting the order into two lines", async () => {
    const { profile } = await createSeller();
    const { ticket } = await createEventWithTicket({
      sellerProfileId: profile.id,
      quantity: 50,
      tier: "GROUP",
      isGroup: true,
      minGroupSize: 2,
      maxGroupSize: 5,
    });
    const buyer = await createUser("USER");

    const res = await placeOrder(buyer, [
      { ticketTypeId: ticket.id, quantity: 3 },
      { ticketTypeId: ticket.id, quantity: 3 },
    ]);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/maximum of 5/);
    expect((await prisma.ticketType.findUniqueOrThrow({ where: { id: ticket.id } })).sold).toBe(0);
  });
});

describe("ticket rules", () => {
  it("enforces group minimum and maximum sizes", async () => {
    const { profile } = await createSeller();
    const { ticket } = await createEventWithTicket({
      sellerProfileId: profile.id,
      quantity: 50,
      tier: "GROUP",
      isGroup: true,
      minGroupSize: 2,
      maxGroupSize: 5,
    });
    const buyer = await createUser("USER");

    expect((await placeOrder(buyer, [{ ticketTypeId: ticket.id, quantity: 1 }])).status).toBe(400);
    expect((await placeOrder(buyer, [{ ticketTypeId: ticket.id, quantity: 6 }])).status).toBe(400);
    expect((await placeOrder(buyer, [{ ticketTypeId: ticket.id, quantity: 3 }])).status).toBe(201);
  });

  it("rejects early bird tickets outside their sales window", async () => {
    const { profile } = await createSeller();
    const buyer = await createUser("USER");

    const ended = await createEventWithTicket({
      sellerProfileId: profile.id,
      tier: "EARLY_BIRD",
      ticketStartsAt: inDays(-10),
      ticketEndsAt: inDays(-1),
    });
    const endedRes = await placeOrder(buyer, [{ ticketTypeId: ended.ticket.id, quantity: 1 }]);
    expect(endedRes.status).toBe(400);
    expect(endedRes.body.message).toMatch(/have ended/);

    const notStarted = await createEventWithTicket({
      sellerProfileId: profile.id,
      tier: "EARLY_BIRD",
      ticketStartsAt: inDays(1),
      ticketEndsAt: inDays(3),
    });
    const notStartedRes = await placeOrder(buyer, [{ ticketTypeId: notStarted.ticket.id, quantity: 1 }]);
    expect(notStartedRes.status).toBe(400);
    expect(notStartedRes.body.message).toMatch(/not started/);
  });

  it("does not sell tickets for draft events or suspended sellers", async () => {
    const buyer = await createUser("USER");

    const approved = await createSeller("APPROVED");
    const draft = await createEventWithTicket({ sellerProfileId: approved.profile.id, eventStatus: "DRAFT" });
    expect((await placeOrder(buyer, [{ ticketTypeId: draft.ticket.id, quantity: 1 }])).status).toBe(400);

    const suspended = await createSeller("SUSPENDED");
    const live = await createEventWithTicket({ sellerProfileId: suspended.profile.id });
    expect((await placeOrder(buyer, [{ ticketTypeId: live.ticket.id, quantity: 1 }])).status).toBe(400);
  });

  it("requires login to place an order", async () => {
    const res = await api().post("/api/v1/orders").send({ items: [{ ticketTypeId: "x", quantity: 1 }] });
    expect(res.status).toBe(401);
  });
});

describe("free tickets", () => {
  it("pays the order immediately and issues one ticket per person", async () => {
    const { profile } = await createSeller();
    const { ticket } = await createEventWithTicket({ sellerProfileId: profile.id, priceCents: 0, quantity: 10 });
    const buyer = await createUser("USER");

    const res = await placeOrder(buyer, [{ ticketTypeId: ticket.id, quantity: 2 }]);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("PAID");
    expect(res.body.data.totalCents).toBe(0);
    expect(res.body.data.tickets).toHaveLength(2);
    expect(new Set(res.body.data.tickets.map((t: { code: string }) => t.code)).size).toBe(2); // all codes differ
  });
});

describe("reservation holds", () => {
  it("returns stock when an unpaid order expires", async () => {
    const { profile } = await createSeller();
    const { ticket } = await createEventWithTicket({ sellerProfileId: profile.id, quantity: 5 });
    const buyer = await createUser("USER");

    const res = await placeOrder(buyer, [{ ticketTypeId: ticket.id, quantity: 3 }]);
    expect(res.status).toBe(201);
    expect((await prisma.ticketType.findUniqueOrThrow({ where: { id: ticket.id } })).sold).toBe(3);

    await prisma.order.update({
      where: { id: res.body.data.id },
      data: { reservationExpiresAt: new Date(Date.now() - 60_000) },
    });

    expect(await releaseExpiredOrders()).toBe(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: res.body.data.id } })).status).toBe("EXPIRED");
    expect((await prisma.ticketType.findUniqueOrThrow({ where: { id: ticket.id } })).sold).toBe(0);
  });

  it("lets the buyer cancel their own unpaid order, but nobody else", async () => {
    const { profile } = await createSeller();
    const { ticket } = await createEventWithTicket({ sellerProfileId: profile.id, quantity: 5 });
    const buyer = await createUser("USER");
    const stranger = await createUser("USER");

    const res = await placeOrder(buyer, [{ ticketTypeId: ticket.id, quantity: 2 }]);
    const orderId = res.body.data.id as string;

    const byStranger = await api().post(`/api/v1/orders/${orderId}/cancel`).set(authHeader(stranger));
    expect(byStranger.status).toBe(404);

    const byOwner = await api().post(`/api/v1/orders/${orderId}/cancel`).set(authHeader(buyer));
    expect(byOwner.status).toBe(200);
    expect(byOwner.body.data.status).toBe("CANCELLED");
    expect((await prisma.ticketType.findUniqueOrThrow({ where: { id: ticket.id } })).sold).toBe(0);
  });
});
// ==========================================
// END OF FILE: backend/tests/orders.test.ts
// ==========================================