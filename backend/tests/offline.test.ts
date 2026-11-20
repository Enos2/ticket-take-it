// ==========================================
// FILE: backend/tests/offline.test.ts
// PURPOSE: Offline gate scanning: the gate pack, uploading scans made without internet, duplicate uploads, conflicts and gate rules.
// ==========================================
import { createHash } from "crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/config/database";
import { api, authHeader, createUser, resetDb, setupPaidOrder } from "./helpers";

beforeEach(resetDb);

type Person = { id: string; email: string; role: "USER" | "SELLER" | "ADMIN" };

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

// A paid order of tickets, and the event's owner (who is allowed to scan at its door).
async function setup(quantity = 3) {
  const paid = await setupPaidOrder({ quantity, stock: 10 });
  const tickets = await prisma.ticket.findMany({
    where: { userId: paid.buyer.id },
    include: { event: { include: { seller: { include: { user: true } } } } },
    orderBy: { id: "asc" },
  });
  const event = tickets[0].event;
  const owner = { id: event.seller.user.id, email: event.seller.user.email, role: event.seller.user.role } as Person;
  return { buyer: paid.buyer, tickets, event, owner };
}

const getPack = (who: Person, eventId: string) => api().get(`/api/v1/door/events/${eventId}/offline-pack`).set(authHeader(who));

const scanAt = (id: string, code: string, extra: { gateId?: string } = {}) => ({
  id,
  code,
  scannedAt: new Date(Date.now() - 60_000).toISOString(), // a minute ago, while the phone had no internet
  ...extra,
});

const upload = (who: Person, eventId: string, scans: unknown[], deviceId = "device-test-0001") =>
  api().post("/api/v1/door/sync").set(authHeader(who)).send({ eventId, deviceId, scans });

describe("the gate pack", () => {
  it("gives the door staff the tickets as hashes, never as codes", async () => {
    const { tickets, event, owner } = await setup();

    const res = await getPack(owner, event.id);

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.body.data.tickets).toHaveLength(3);
    expect(res.body.data.enforceWindow).toBe(true);

    const hashes = new Set(res.body.data.tickets.map((t: { h: string }) => t.h));
    for (const ticket of tickets) {
      expect(hashes.has(sha256(ticket.code))).toBe(true);
      expect(JSON.stringify(res.body)).not.toContain(ticket.code); // the code itself never leaves the server
    }
  });

  it("is only for the event's own door staff and admins", async () => {
    const { buyer, event } = await setup();
    const stranger = await createUser("USER");
    const admin = await createUser("ADMIN");

    expect((await getPack(stranger, event.id)).status).toBe(403);
    expect((await getPack(buyer, event.id)).status).toBe(403); // holding a ticket is not door access
    const asAdmin = await getPack(admin, event.id);
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.data.enforceWindow).toBe(false);
  });
});

describe("uploading scans made without internet", () => {
  it("admits the tickets, stamped with the time of the scan", async () => {
    const { tickets, event, owner } = await setup();
    const scan = scanAt("scan-0000001", tickets[0].code);

    const res = await upload(owner, event.id, [scan]);

    expect(res.status).toBe(200);
    expect(res.body.data.results[0].outcome).toBe("ADMITTED");

    const used = await prisma.ticket.findUniqueOrThrow({ where: { id: tickets[0].id } });
    expect(used.status).toBe("USED");
    expect(used.checkedInById).toBe(owner.id);
    expect(Math.abs((used.usedAt?.getTime() ?? 0) - new Date(scan.scannedAt).getTime())).toBeLessThan(1000);
  });

  it("never counts the same upload twice", async () => {
    const { tickets, event, owner } = await setup();
    const scans = [scanAt("scan-0000001", tickets[0].code)];

    await upload(owner, event.id, scans);
    const firstUse = (await prisma.ticket.findUniqueOrThrow({ where: { id: tickets[0].id } })).usedAt;

    const again = await upload(owner, event.id, scans);
    expect(again.body.data.results[0]).toMatchObject({ outcome: "ADMITTED", repeat: true });
    expect(await prisma.offlineScan.count()).toBe(1);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: tickets[0].id } })).usedAt).toEqual(firstUse);
  });

  it("flags a ticket that was already used somewhere else, and lists it for the organiser", async () => {
    const { tickets, event, owner } = await setup();
    const admin = await createUser("ADMIN");

    // Another gate, with internet, let this ticket in first.
    expect((await api().post("/api/v1/checkin").set(authHeader(admin)).send({ code: tickets[0].code })).status).toBe(200);

    const res = await upload(owner, event.id, [scanAt("scan-0000001", tickets[0].code)]);
    expect(res.body.data.results[0].outcome).toBe("ALREADY_USED");
    expect(res.body.data.results[0].firstUsedAt).toBeTruthy();

    const review = await api().get(`/api/v1/door/events/${event.id}/offline-scans`).set(authHeader(owner));
    expect(review.status).toBe(200);
    expect(review.body.data.counts.ALREADY_USED).toBe(1);
    expect(review.body.data.conflicts[0]).toMatchObject({ outcome: "ALREADY_USED", holder: expect.any(String) });
  });

  it("flags codes that are not tickets, tickets of other events and voided tickets", async () => {
    const { tickets, event, owner } = await setup();
    const other = await setupPaidOrder({ quantity: 1, stock: 5 });
    const otherTicket = await prisma.ticket.findFirstOrThrow({ where: { userId: other.buyer.id } });
    await prisma.ticket.update({ where: { id: tickets[1].id }, data: { status: "VOID" } });

    const res = await upload(owner, event.id, [
      scanAt("scan-0000001", "x".repeat(22)),
      scanAt("scan-0000002", otherTicket.code),
      scanAt("scan-0000003", tickets[1].code),
    ]);

    expect(res.body.data.results.map((r: { outcome: string }) => r.outcome)).toEqual(["UNKNOWN_TICKET", "WRONG_EVENT", "TICKET_VOIDED"]);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: otherTicket.id } })).status).toBe("VALID"); // another event's ticket is untouched
  });

  it("applies the gate's tier rules and leaves the ticket unused when they fail", async () => {
    const { tickets, event, owner } = await setup();
    const vipGate = await prisma.gate.create({ data: { eventId: event.id, name: "VIP entrance", allowedTiers: ["VIP"] } });

    const res = await upload(owner, event.id, [scanAt("scan-0000001", tickets[0].code, { gateId: vipGate.id })]);

    expect(res.body.data.results[0].outcome).toBe("WRONG_GATE");
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: tickets[0].id } })).status).toBe("VALID");
  });

  it("does not accept uploads from people who are not door staff", async () => {
    const { tickets, event } = await setup();
    const stranger = await createUser("USER");

    expect((await upload(stranger, event.id, [scanAt("scan-0000001", tickets[0].code)])).status).toBe(403);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: tickets[0].id } })).status).toBe("VALID");
  });
});
// ==========================================
// END OF FILE: backend/tests/offline.test.ts
// ==========================================