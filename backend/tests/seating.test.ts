// ==========================================
// FILE: backend/tests/seating.test.ts
// PURPOSE: Seat layouts, holding and buying seats, late payments, voided tickets, blocked seats and seats given to guests.
// ==========================================
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/config/database";
import { cancelOrder } from "../src/modules/orders/orders.service";
import { api, authHeader, createEventWithTicket, createSeller, createUser, payOrder, resetDb } from "./helpers";

beforeEach(resetDb);

type Person = { id: string; email: string; role: "USER" | "SELLER" | "ADMIN" };
type MapSeat = { id: string; number: number; state: string };
type MapRow = { row: string; seats: MapSeat[] };

// A seller, an event, and one seated section: 2 rows of 5 seats (A1..A5, B1..B5).
async function setup() {
  const seller = await createSeller();
  const { event, ticket } = await createEventWithTicket({ sellerProfileId: seller.profile.id, quantity: 50 });

  const saved = await api()
    .put(`/api/v1/events/${event.id}/seating`)
    .set(authHeader(seller.user))
    .send({ sections: [{ name: "Floor", ticketTypeId: ticket.id, rows: 2, seatsPerRow: 5 }] });
  expect(saved.status).toBe(200);

  const rows = saved.body.data.sections[0].rows as MapRow[];
  const seatIds = rows.flatMap((r) => r.seats.map((s) => s.id));
  return { seller, event, ticket, seatIds };
}

const placeSeats = (buyer: Person, seatIds: string[]) =>
  api().post("/api/v1/orders").set(authHeader(buyer)).send({ items: [], seatIds });

const publicMap = async (eventId: string) =>
  (await api().get(`/api/v1/events/${eventId}/seating/map`)).body.data.sections[0].rows.flatMap((r: MapRow) => r.seats) as MapSeat[];

describe("seat layout", () => {
  it("turns a ticket type into seats and shows them on the public map", async () => {
    const { event, ticket, seatIds } = await setup();

    expect(seatIds).toHaveLength(10);
    expect((await prisma.ticketType.findUniqueOrThrow({ where: { id: ticket.id } })).quantity).toBe(10);

    const seats = await publicMap(event.id);
    expect(seats.every((s) => s.state === "available")).toBe(true);
  });

  it("refuses plain quantity purchases of a seated ticket type", async () => {
    const { ticket } = await setup();
    const buyer = await createUser("USER");

    const res = await api().post("/api/v1/orders").set(authHeader(buyer)).send({ items: [{ ticketTypeId: ticket.id, quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  it("cannot be replaced once a seat is sold or held", async () => {
    const { seller, event, ticket, seatIds } = await setup();
    const buyer = await createUser("USER");
    expect((await placeSeats(buyer, [seatIds[0]])).status).toBe(201);

    const again = await api()
      .put(`/api/v1/events/${event.id}/seating`)
      .set(authHeader(seller.user))
      .send({ sections: [{ name: "Balcony", ticketTypeId: ticket.id, rows: 1, seatsPerRow: 4 }] });
    expect(again.status).toBe(409);
  });
});

describe("buying seats", () => {
  it("holds the chosen seats, so nobody else can take them", async () => {
    const { event, seatIds } = await setup();
    const [a, b] = await Promise.all([createUser("USER"), createUser("USER")]);

    expect((await placeSeats(a, [seatIds[0], seatIds[1]])).status).toBe(201);
    expect((await placeSeats(b, [seatIds[1]])).status).toBe(400); // seat 2 is already held
    expect((await placeSeats(b, [seatIds[2]])).status).toBe(201);

    const states = (await publicMap(event.id)).map((s) => s.state);
    expect(states.filter((s) => s === "held")).toHaveLength(3);
  });

  it("gives the seat to exactly one buyer when many try at the same moment", async () => {
    const { seatIds } = await setup();
    const buyers = await Promise.all(Array.from({ length: 10 }, () => createUser("USER")));

    const results = await Promise.all(buyers.map((buyer) => placeSeats(buyer, [seatIds[0]])));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
  });

  it("ties each ticket to its seat once the order is paid", async () => {
    const { seatIds } = await setup();
    const buyer = await createUser("USER");

    const placed = await placeSeats(buyer, [seatIds[0], seatIds[1]]);
    expect((await payOrder(placed.body.data)).status).toBe(200);

    const mine = await api().get("/api/v1/orders/my-tickets").set(authHeader(buyer));
    const seats = mine.body.data.map((t: { seat: { row: string; number: number; section: { name: string } } | null }) => t.seat);
    expect(seats).toHaveLength(2);
    expect(seats).toContainEqual({ row: "A", number: 1, section: { name: "Floor" } });
    expect(seats).toContainEqual({ row: "A", number: 2, section: { name: "Floor" } });
  });

  it("frees the seats when the buyer cancels", async () => {
    const { seatIds } = await setup();
    const [a, b] = await Promise.all([createUser("USER"), createUser("USER")]);

    const placed = await placeSeats(a, [seatIds[0]]);
    expect((await placeSeats(b, [seatIds[0]])).status).toBe(400);

    await cancelOrder(a.id, placed.body.data.id);
    expect((await placeSeats(b, [seatIds[0]])).status).toBe(201);
  });

  it("frees a seat when its ticket is voided (refund, revoke, cancellation)", async () => {
    const { seatIds } = await setup();
    const [a, b] = await Promise.all([createUser("USER"), createUser("USER")]);

    const placed = await placeSeats(a, [seatIds[0]]);
    expect((await payOrder(placed.body.data)).status).toBe(200);
    expect((await placeSeats(b, [seatIds[0]])).status).toBe(400); // sold

    await prisma.ticket.updateMany({ where: { userId: a.id }, data: { status: "VOID" } });
    expect((await prisma.seat.findUniqueOrThrow({ where: { id: seatIds[0] } })).ticketId).toBeNull();
    expect((await placeSeats(b, [seatIds[0]])).status).toBe(201);
  });

  it("flags a late payment for a refund when the seat was taken after the hold ran out", async () => {
    const { seatIds } = await setup();
    const [a, b] = await Promise.all([createUser("USER"), createUser("USER")]);

    const first = await placeSeats(a, [seatIds[0]]);
    await prisma.seat.update({ where: { id: seatIds[0] }, data: { heldUntil: new Date(Date.now() - 1000) } }); // the hold ran out
    expect((await placeSeats(b, [seatIds[0]])).status).toBe(201); // someone else took the seat

    await payOrder(first.body.data);

    const payments = await prisma.payment.findMany({ where: { orderId: first.body.data.id } });
    expect(payments.some((p) => (p.metadata as { needsRefund?: boolean } | null)?.needsRefund === true)).toBe(true);
    expect(await prisma.ticket.count({ where: { orderId: first.body.data.id } })).toBe(0); // no ticket for a seat that is not theirs
  });
});

describe("seats kept for guests", () => {
  it("blocks seats, gives them to a guest, and takes them back", async () => {
    const { seller, event, ticket, seatIds } = await setup();
    const buyer = await createUser("USER");
    const guest = await createUser("USER");

    // Block 2 seats: nobody can buy them, and they count as kept for guests.
    const blocked = await api()
      .post(`/api/v1/events/${event.id}/seating/block`)
      .set(authHeader(seller.user))
      .send({ seatIds: [seatIds[0], seatIds[1]], blocked: true });
    expect(blocked.status).toBe(200);
    expect((await prisma.ticketType.findUniqueOrThrow({ where: { id: ticket.id } })).hostReserved).toBe(2);
    expect((await placeSeats(buyer, [seatIds[0]])).status).toBe(400);

    // Give one of them to a guest.
    const given = await api()
      .post(`/api/v1/events/${event.id}/seating/give`)
      .set(authHeader(seller.user))
      .send({ seatIds: [seatIds[0]], recipientEmail: guest.email, note: "Sponsor" });
    expect(given.status).toBe(201);

    const guestTicket = await prisma.ticket.findFirstOrThrow({ where: { userId: guest.id } });
    expect((await prisma.seat.findUniqueOrThrow({ where: { id: seatIds[0] } })).ticketId).toBe(guestTicket.id);
    expect((await prisma.ticketType.findUniqueOrThrow({ where: { id: ticket.id } })).hostIssued).toBe(1);

    // A seat that is not blocked cannot be given.
    const notBlocked = await api()
      .post(`/api/v1/events/${event.id}/seating/give`)
      .set(authHeader(seller.user))
      .send({ seatIds: [seatIds[5]], recipientEmail: guest.email });
    expect(notBlocked.status).toBe(400);

    // Taking the ticket back returns the seat to the blocked pool, not to public sale.
    const revoked = await api().delete(`/api/v1/events/${event.id}/comps/${guestTicket.id}`).set(authHeader(seller.user));
    expect(revoked.status).toBe(200);

    const seat = await prisma.seat.findUniqueOrThrow({ where: { id: seatIds[0] } });
    expect(seat.ticketId).toBeNull();
    expect(seat.isBlocked).toBe(true);
    expect((await placeSeats(buyer, [seatIds[0]])).status).toBe(400);

    // Putting seats back on sale gives the tickets back.
    const unblocked = await api()
      .post(`/api/v1/events/${event.id}/seating/block`)
      .set(authHeader(seller.user))
      .send({ seatIds: [seatIds[0], seatIds[1]], blocked: false });
    expect(unblocked.status).toBe(200);
    expect((await prisma.ticketType.findUniqueOrThrow({ where: { id: ticket.id } })).hostReserved).toBe(0);
    expect((await placeSeats(buyer, [seatIds[0]])).status).toBe(201);
  });

  it("does not give out plain tickets of a seated ticket type", async () => {
    const { seller, event, ticket } = await setup();
    const guest = await createUser("USER");

    const res = await api()
      .post(`/api/v1/events/${event.id}/comps`)
      .set(authHeader(seller.user))
      .send({ ticketTypeId: ticket.id, quantity: 1, recipientEmail: guest.email });
    expect(res.status).toBe(400);
  });
});
// ==========================================
// END OF FILE: backend/tests/seating.test.ts
// ==========================================