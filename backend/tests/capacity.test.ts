// ==========================================
// FILE: backend/tests/capacity.test.ts
// PURPOSE: Event capacity, automatic sold-out status, held-back tickets and complimentary tickets.
// ==========================================
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/config/database";
import { cancelOrder } from "../src/modules/orders/orders.service";
import { refundOrder } from "../src/modules/payments/refund.service";
import { api, authHeader, createEventWithTicket, createSeller, createUser, placeOrder, resetDb } from "./helpers";

beforeEach(resetDb);

// A seller, a published event and one ticket type, with an optional event capacity.
async function setup(opts: { quantity?: number; maxCapacity?: number | null } = {}) {
  const seller = await createSeller();
  const { event, ticket } = await createEventWithTicket({ sellerProfileId: seller.profile.id, quantity: opts.quantity ?? 10 });
  if (opts.maxCapacity !== undefined && opts.maxCapacity !== null) {
    await prisma.event.update({ where: { id: event.id }, data: { maxCapacity: opts.maxCapacity } });
  }
  return { seller, event, ticket };
}

const reserve = (
  seller: { user: { id: string; email: string; role: "SELLER" } },
  eventId: string,
  ticketId: string,
  hostReserved: number
) =>
  api()
    .patch(`/api/v1/events/${eventId}/tickets/${ticketId}`)
    .set(authHeader(seller.user))
    .send({ hostReserved });

const giveOut = (
  seller: { user: { id: string; email: string; role: "SELLER" } },
  eventId: string,
  body: { ticketTypeId: string; quantity: number; recipientEmail: string; note?: string }
) => api().post(`/api/v1/events/${eventId}/comps`).set(authHeader(seller.user)).send(body);

const statusOf = async (eventId: string) => (await prisma.event.findUniqueOrThrow({ where: { id: eventId } })).status;

describe("event capacity", () => {
  it("declares the event sold out when the capacity is reached, across ticket types", async () => {
    const { event, ticket } = await setup({ quantity: 10, maxCapacity: 12 });
    const second = await prisma.ticketType.create({
      data: { eventId: event.id, name: "VIP", tier: "VIP", priceCents: 200_000, currency: "KES", quantity: 10 },
    });
    const [a, b, c] = await Promise.all([createUser("USER"), createUser("USER"), createUser("USER")]);

    expect((await placeOrder(a, [{ ticketTypeId: ticket.id, quantity: 7 }])).status).toBe(201);
    expect((await placeOrder(b, [{ ticketTypeId: second.id, quantity: 5 }])).status).toBe(201);

    expect(await statusOf(event.id)).toBe("SOLD_OUT");
    expect((await placeOrder(c, [{ ticketTypeId: ticket.id, quantity: 1 }])).status).toBe(400);
  });

  it("never sells past the capacity when many buyers act at the same moment", async () => {
    const { ticket } = await setup({ quantity: 50, maxCapacity: 5 });
    const buyers = await Promise.all(Array.from({ length: 15 }, () => createUser("USER")));

    const results = await Promise.all(buyers.map((buyer) => placeOrder(buyer, [{ ticketTypeId: ticket.id, quantity: 1 }])));

    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.status !== 201).every((r) => r.status === 400)).toBe(true);
    expect((await prisma.ticketType.findUniqueOrThrow({ where: { id: ticket.id } })).sold).toBe(5);
  });

  it("keeps a sold-out event visible, and puts it back on sale when tickets come back", async () => {
    const { event, ticket } = await setup({ quantity: 10, maxCapacity: 2 });
    const buyer = await createUser("USER");

    const placed = await placeOrder(buyer, [{ ticketTypeId: ticket.id, quantity: 2 }]);
    expect(placed.status).toBe(201);
    expect(await statusOf(event.id)).toBe("SOLD_OUT");

    const page = await api().get(`/api/v1/events/${event.slug}`);
    expect(page.status).toBe(200);
    expect(page.body.data.status).toBe("SOLD_OUT");

    await cancelOrder(buyer.id, placed.body.data.id);
    expect(await statusOf(event.id)).toBe("PUBLISHED");
  });

  it("refuses a capacity lower than what is already sold, and sells out when it equals it", async () => {
    const { seller, event, ticket } = await setup({ quantity: 10 });
    const buyer = await createUser("USER");
    expect((await placeOrder(buyer, [{ ticketTypeId: ticket.id, quantity: 5 }])).status).toBe(201);

    const tooLow = await api().patch(`/api/v1/events/${event.id}`).set(authHeader(seller.user)).send({ maxCapacity: 3 });
    expect(tooLow.status).toBe(400);

    const exact = await api().patch(`/api/v1/events/${event.id}`).set(authHeader(seller.user)).send({ maxCapacity: 5 });
    expect(exact.status).toBe(200);
    expect(await statusOf(event.id)).toBe("SOLD_OUT");

    const removed = await api().patch(`/api/v1/events/${event.id}`).set(authHeader(seller.user)).send({ maxCapacity: null });
    expect(removed.status).toBe(200);
    expect(await statusOf(event.id)).toBe("PUBLISHED");
  });
});

describe("tickets held back for the seller", () => {
  it("keeps held-back tickets out of public sale", async () => {
    const { seller, event, ticket } = await setup({ quantity: 10 });
    const buyer = await createUser("USER");

    expect((await reserve(seller, event.id, ticket.id, 3)).status).toBe(200);

    const tooMany = await placeOrder(buyer, [{ ticketTypeId: ticket.id, quantity: 8 }]);
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.message).toMatch(/Only 7 left/);

    expect((await placeOrder(buyer, [{ ticketTypeId: ticket.id, quantity: 7 }])).status).toBe(201);
    expect(await statusOf(event.id)).toBe("SOLD_OUT"); // nothing is left for the public
  });

  it("refuses to hold back more than the ticket quantity or the event capacity", async () => {
    const { seller, event, ticket } = await setup({ quantity: 10, maxCapacity: 6 });

    expect((await reserve(seller, event.id, ticket.id, 11)).status).toBe(400); // more than the quantity
    expect((await reserve(seller, event.id, ticket.id, 7)).status).toBe(400); // more than the capacity
    expect((await reserve(seller, event.id, ticket.id, 6)).status).toBe(200);
  });

  it("lets the seller give held-back tickets to a guest, and nobody else", async () => {
    const { seller, event, ticket } = await setup({ quantity: 10 });
    const guest = await createUser("USER");
    const buyer = await createUser("USER");
    await reserve(seller, event.id, ticket.id, 3);
    expect((await placeOrder(buyer, [{ ticketTypeId: ticket.id, quantity: 7 }])).status).toBe(201);

    const given = await giveOut(seller, event.id, { ticketTypeId: ticket.id, quantity: 3, recipientEmail: guest.email, note: "Sponsor" });
    expect(given.status).toBe(201);

    expect(await prisma.ticket.count({ where: { userId: guest.id, status: "VALID" } })).toBe(3);
    const fresh = await prisma.ticketType.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(fresh.sold).toBe(10);
    expect(fresh.hostIssued).toBe(3);
    expect(await prisma.order.count({ where: { isComp: true, userId: guest.id } })).toBe(1);

    // The held-back pool is empty now.
    const more = await giveOut(seller, event.id, { ticketTypeId: ticket.id, quantity: 1, recipientEmail: guest.email });
    expect(more.status).toBe(400);

    // Another seller cannot give out tickets for this event.
    const other = await createSeller();
    const denied = await giveOut(other, event.id, { ticketTypeId: ticket.id, quantity: 1, recipientEmail: guest.email });
    expect(denied.status).toBe(403);
  });

  it("tells the seller when the guest has no account", async () => {
    const { seller, event, ticket } = await setup({ quantity: 10 });
    await reserve(seller, event.id, ticket.id, 2);

    const res = await giveOut(seller, event.id, { ticketTypeId: ticket.id, quantity: 1, recipientEmail: "nobody@test.dev" });
    expect(res.status).toBe(404);
    expect((await prisma.ticketType.findUniqueOrThrow({ where: { id: ticket.id } })).hostIssued).toBe(0);
  });

  it("takes a given-out ticket back into the held-back pool, once", async () => {
    const { seller, event, ticket } = await setup({ quantity: 10 });
    const guest = await createUser("USER");
    await reserve(seller, event.id, ticket.id, 3);
    await giveOut(seller, event.id, { ticketTypeId: ticket.id, quantity: 2, recipientEmail: guest.email });

    const given = await prisma.ticket.findFirstOrThrow({ where: { userId: guest.id } });
    const revoked = await api().delete(`/api/v1/events/${event.id}/comps/${given.id}`).set(authHeader(seller.user));
    expect(revoked.status).toBe(200);

    const fresh = await prisma.ticketType.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(fresh.sold).toBe(1);
    expect(fresh.hostIssued).toBe(1);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: given.id } })).status).toBe("VOID");

    const again = await api().delete(`/api/v1/events/${event.id}/comps/${given.id}`).set(authHeader(seller.user));
    expect(again.status).toBe(409);

    const list = await api().get(`/api/v1/events/${event.id}/comps`).set(authHeader(seller.user));
    expect(list.status).toBe(200);
    expect(list.body.data.reservations[0]).toMatchObject({ reserved: 3, givenOut: 1, remaining: 2 });
  });

  it("does not allow a complimentary order to be refunded", async () => {
    const { seller, event, ticket } = await setup({ quantity: 10 });
    const guest = await createUser("USER");
    await reserve(seller, event.id, ticket.id, 2);
    await giveOut(seller, event.id, { ticketTypeId: ticket.id, quantity: 1, recipientEmail: guest.email });

    const order = await prisma.order.findFirstOrThrow({ where: { isComp: true } });
    await expect(refundOrder("admin-id", order.id)).rejects.toThrow(/Complimentary/);
  });
});
// ==========================================
// END OF FILE: backend/tests/capacity.test.ts
// ==========================================