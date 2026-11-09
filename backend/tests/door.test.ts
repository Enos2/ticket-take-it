// ==========================================
// FILE: backend/tests/door.test.ts
// PURPOSE: Door staff, gates, scanning for the right event, scannable events and live attendance.
// ==========================================
import { beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { prisma } from "../src/config/database";
import { api, authHeader, createEventWithTicket, createSeller, createUser, placeOrder, resetDb } from "./helpers";

beforeEach(resetDb);

type Actor = { id: string; email: string; role: Role };

// An organiser with an event starting soon, and a buyer holding `count` free tickets for it.
async function setup(count = 3) {
  const seller = await createSeller();
  const { event, ticket } = await createEventWithTicket({ sellerProfileId: seller.profile.id, priceCents: 0, quantity: 50 });
  const buyer = await createUser("USER");
  const res = await placeOrder(buyer, [{ ticketTypeId: ticket.id, quantity: count }]);
  expect(res.status).toBe(201);
  const codes = (res.body.data.tickets as { code: string }[]).map((t) => t.code);
  return { seller, event, ticket, buyer, codes };
}

const scan = (user: Actor, body: object) => api().post("/api/v1/checkin").set(authHeader(user)).send(body);
const addStaff = (seller: Actor, email: string) => api().post("/api/v1/door/staff").set(authHeader(seller)).send({ email });
const addGate = (user: Actor, eventId: string, body: object) =>
  api().post(`/api/v1/door/events/${eventId}/gates`).set(authHeader(user)).send(body);
const ticketRow = (code: string) => prisma.ticket.findUniqueOrThrow({ where: { code } });

describe("door staff", () => {
  it("lets an organizer add staff, who can scan that organizer's tickets and nobody else's", async () => {
    const { seller, codes } = await setup(2);
    const other = await setup(1);
    const staff = await createUser("USER");

    const added = await addStaff(seller.user, staff.email.toUpperCase());
    expect(added.status).toBe(201);
    expect(added.body.data).toMatchObject({ email: staff.email, active: true });

    expect((await scan(staff, { code: codes[0] })).status).toBe(200);
    expect((await scan(staff, { code: other.codes[0] })).status).toBe(403);

    const stranger = await createUser("USER");
    expect((await scan(stranger, { code: codes[1] })).status).toBe(403);
    expect((await ticketRow(codes[1])).status).toBe("VALID");
  });

  it("gives staff no seller powers", async () => {
    const { seller, event } = await setup(1);
    const staff = await createUser("USER");
    await addStaff(seller.user, staff.email);

    expect((await api().get("/api/v1/sellers/orders").set(authHeader(staff))).status).toBe(403);
    expect((await api().get("/api/v1/finance/earnings").set(authHeader(staff))).status).toBe(403);
    expect((await addStaff(staff, "friend@test.dev")).status).toBe(403);
    expect((await addGate(staff, event.id, { name: "Back door" })).status).toBe(403);
  });

  it("stops working the moment someone is removed", async () => {
    const { seller, codes } = await setup(2);
    const staff = await createUser("USER");
    const added = await addStaff(seller.user, staff.email);
    expect((await scan(staff, { code: codes[0] })).status).toBe(200);

    const removed = await api().delete(`/api/v1/door/staff/${added.body.data.id}`).set(authHeader(seller.user));
    expect(removed.status).toBe(200);
    expect((await scan(staff, { code: codes[1] })).status).toBe(403);

    const list = await api().get("/api/v1/door/staff").set(authHeader(seller.user));
    expect(list.body.data).toHaveLength(0);
    expect((await api().delete(`/api/v1/door/staff/${added.body.data.id}`).set(authHeader(seller.user))).status).toBe(404);
  });

  it("waits for a verified account when the person has not signed up yet", async () => {
    const { seller, codes } = await setup(1);

    const added = await addStaff(seller.user, "later@test.dev");
    expect(added.status).toBe(201);
    expect(added.body.data.active).toBe(false);

    const account = await prisma.user.create({ data: { email: "later@test.dev", passwordHash: "x", fullName: "Later Joiner", emailVerified: false } });
    const later: Actor = { id: account.id, email: account.email, role: account.role };

    // Registering with the address is not enough. It has to be verified.
    expect((await scan(later, { code: codes[0] })).status).toBe(403);

    await prisma.user.update({ where: { id: account.id }, data: { emailVerified: true } });
    expect((await scan(later, { code: codes[0] })).status).toBe(200);

    const list = await api().get("/api/v1/door/staff").set(authHeader(seller.user));
    expect(list.body.data[0]).toMatchObject({ email: "later@test.dev", active: true, name: "Later Joiner" });
  });

  it("refuses yourself, the same person twice, and a bad email", async () => {
    const { seller } = await setup(1);
    const staff = await createUser("USER");

    expect((await addStaff(seller.user, seller.user.email)).status).toBe(400);
    expect((await addStaff(seller.user, "not an email")).status).toBe(400);
    expect((await addStaff(seller.user, staff.email)).status).toBe(201);
    expect((await addStaff(seller.user, staff.email)).status).toBe(409);
  });

  it("keeps the audit log free of staff email addresses", async () => {
    const { seller } = await setup(1);
    const staff = await createUser("USER");
    const added = await addStaff(seller.user, staff.email);
    await api().delete(`/api/v1/door/staff/${added.body.data.id}`).set(authHeader(seller.user));

    const rows = await prisma.auditLog.findMany({ where: { action: { in: ["staff.add", "staff.remove"] } } });
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows)).not.toContain(staff.email);
  });

  it("tells the app who works the door", async () => {
    const { seller } = await setup(1);
    const staff = await createUser("USER");
    const buyer = await createUser("USER");
    await addStaff(seller.user, staff.email);

    expect((await api().get("/api/v1/users/me").set(authHeader(staff))).body.data.doorStaff).toBe(true);
    expect((await api().get("/api/v1/users/me").set(authHeader(buyer))).body.data.doorStaff).toBe(false);
  });
});

describe("scanning for a specific event", () => {
  it("refuses a ticket for a different event, even the same organizer's, and leaves it unused", async () => {
    const { seller, event, codes } = await setup(1);
    const second = await createEventWithTicket({ sellerProfileId: seller.profile.id, priceCents: 0 });
    const buyer = await createUser("USER");
    const bought = await placeOrder(buyer, [{ ticketTypeId: second.ticket.id, quantity: 1 }]);
    const otherCode = bought.body.data.tickets[0].code as string;

    const wrong = await scan(seller.user, { code: otherCode, eventId: event.id });
    expect(wrong.status).toBe(409);
    expect(wrong.body.message).toMatch(/not the event you are scanning for/);
    expect((await ticketRow(otherCode)).status).toBe("VALID");

    expect((await scan(seller.user, { code: codes[0], eventId: event.id })).status).toBe(200);
  });
});

describe("gates", () => {
  it("are set up by the organizer, listed for staff, and can't be duplicated", async () => {
    const { seller, event } = await setup(1);
    const staff = await createUser("USER");
    const stranger = await createUser("USER");
    await addStaff(seller.user, staff.email);

    const made = await addGate(seller.user, event.id, { name: "Main gate" });
    expect(made.status).toBe(201);
    expect(made.body.data).toMatchObject({ name: "Main gate", allowedTiers: [] });

    expect((await addGate(seller.user, event.id, { name: "Main gate" })).status).toBe(409);
    expect((await addGate(seller.user, event.id, { name: "x" })).status).toBe(400);

    const seen = await api().get(`/api/v1/door/events/${event.id}/gates`).set(authHeader(staff));
    expect(seen.status).toBe(200);
    expect(seen.body.data).toHaveLength(1);

    expect((await api().get(`/api/v1/door/events/${event.id}/gates`).set(authHeader(stranger))).status).toBe(403);
  });

  it("can admit only certain ticket types, and record which gate someone came through", async () => {
    const { seller, event, buyer, codes } = await setup(1); // codes[0] is a REGULAR ticket
    const vipType = await prisma.ticketType.create({
      data: { eventId: event.id, name: "VIP pass", tier: "VIP", priceCents: 0, currency: "KES", quantity: 5 },
    });
    const vipOrder = await placeOrder(buyer, [{ ticketTypeId: vipType.id, quantity: 1 }]);
    const vipCode = vipOrder.body.data.tickets[0].code as string;

    const gate = (await addGate(seller.user, event.id, { name: "VIP entrance", allowedTiers: ["VIP", "VVIP"] })).body.data;

    const refused = await scan(seller.user, { code: codes[0], eventId: event.id, gateId: gate.id });
    expect(refused.status).toBe(409);
    expect(refused.body.message).toMatch(/admits VIP and VVIP tickets only/);
    expect((await ticketRow(codes[0])).status).toBe("VALID");

    const admitted = await scan(seller.user, { code: vipCode, eventId: event.id, gateId: gate.id });
    expect(admitted.status).toBe(200);
    expect(admitted.body.data.gate).toBe("VIP entrance");
    expect((await ticketRow(vipCode)).gateId).toBe(gate.id);
  });

  it("must belong to the event, and deleting one keeps the scans already made", async () => {
    const { seller, event, codes } = await setup(1);
    const second = await createEventWithTicket({ sellerProfileId: seller.profile.id, priceCents: 0 });
    const otherGate = (await addGate(seller.user, second.event.id, { name: "Side door" })).body.data;

    const wrong = await scan(seller.user, { code: codes[0], gateId: otherGate.id });
    expect(wrong.status).toBe(400);
    expect((await ticketRow(codes[0])).status).toBe("VALID");

    const gate = (await addGate(seller.user, event.id, { name: "Main gate" })).body.data;
    expect((await scan(seller.user, { code: codes[0], gateId: gate.id })).status).toBe(200);

    const removed = await api().delete(`/api/v1/door/events/${event.id}/gates/${gate.id}`).set(authHeader(seller.user));
    expect(removed.status).toBe(200);

    const kept = await ticketRow(codes[0]);
    expect(kept.status).toBe("USED");
    expect(kept.gateId).toBeNull();
  });
});

describe("events to scan", () => {
  it("lists live events within a week, with the window and counts, for the organizer, staff and admins only", async () => {
    const { seller, event } = await setup(2);
    const staff = await createUser("USER");
    const stranger = await createUser("USER");
    const admin = await createUser("ADMIN");
    await addStaff(seller.user, staff.email);

    const far = await createEventWithTicket({ sellerProfileId: seller.profile.id });
    await prisma.event.update({ where: { id: far.event.id }, data: { startsAt: new Date(Date.now() + 30 * 24 * 3_600_000), endsAt: new Date(Date.now() + 31 * 24 * 3_600_000) } });
    await createEventWithTicket({ sellerProfileId: seller.profile.id, eventStatus: "DRAFT" });

    for (const who of [seller.user, staff, admin]) {
      const res = await api().get("/api/v1/door/events").set(authHeader(who));
      expect(res.status).toBe(200);
      const ids = res.body.data.map((e: { id: string }) => e.id);
      expect(ids).toContain(event.id);
      expect(ids).not.toContain(far.event.id);
    }

    const mine = (await api().get("/api/v1/door/events").set(authHeader(staff))).body.data[0];
    expect(mine).toMatchObject({ id: event.id, open: true, ticketsIssued: 2, checkedIn: 0, gates: [] });

    expect((await api().get("/api/v1/door/events").set(authHeader(stranger))).body.data).toEqual([]);
    expect((await api().get("/api/v1/door/events")).status).toBe(401);
  });
});

describe("live attendance", () => {
  it("counts arrivals by ticket type and gate, and lists the latest scans", async () => {
    const { seller, event, codes } = await setup(3);
    const gate = (await addGate(seller.user, event.id, { name: "Main gate" })).body.data;

    expect((await scan(seller.user, { code: codes[0], eventId: event.id, gateId: gate.id })).status).toBe(200);
    expect((await scan(seller.user, { code: codes[1], eventId: event.id })).status).toBe(200);

    const staff = await createUser("USER");
    await addStaff(seller.user, staff.email);

    const res = await api().get(`/api/v1/door/events/${event.id}/live`).set(authHeader(staff));
    expect(res.status).toBe(200);

    const d = res.body.data;
    expect(d.totals).toEqual({ issued: 3, checkedIn: 2, remaining: 1 });
    expect(d.event.open).toBe(true);
    expect(d.byTicketType).toEqual([expect.objectContaining({ name: "General", issued: 3, checkedIn: 2 })]);
    expect(d.byGate).toEqual(
      expect.arrayContaining([
        { gateId: gate.id, name: "Main gate", checkedIn: 1 },
        { gateId: null, name: "No gate selected", checkedIn: 1 },
      ])
    );
    expect(d.lastHour).toHaveLength(6);
    expect(d.lastHour.reduce((sum: number, b: { count: number }) => sum + b.count, 0)).toBe(2);
    expect(d.recent).toHaveLength(2);
    expect(d.recent[0]).toMatchObject({ ticketType: "General" });
    expect(typeof d.recent[0].holder).toBe("string");
    expect(typeof d.recent[0].scannedBy).toBe("string");
  });

  it("is closed to people who aren't on the door team, and 404s for unknown events", async () => {
    const { event } = await setup(1);
    const stranger = await createUser("USER");

    expect((await api().get(`/api/v1/door/events/${event.id}/live`).set(authHeader(stranger))).status).toBe(403);
    expect((await api().get("/api/v1/door/events/nope/live").set(authHeader(stranger))).status).toBe(404);
    expect((await api().get(`/api/v1/door/events/${event.id}/live`)).status).toBe(401);
  });
});
// ==========================================
// END OF FILE: backend/tests/door.test.ts
// ==========================================