// ==========================================
// FILE: backend/tests/checkin.test.ts
// PURPOSE: Door check-in: every ticket admits once, only the right people can scan.
// ==========================================
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/config/database";
import { api, authHeader, createEventWithTicket, createSeller, createUser, placeOrder, resetDb } from "./helpers";

beforeEach(resetDb);

// A seller with a free event and a buyer holding `count` tickets.
async function setup(count = 1) {
  const seller = await createSeller();
  const { event, ticket } = await createEventWithTicket({ sellerProfileId: seller.profile.id, priceCents: 0, quantity: 20 });
  const buyer = await createUser("USER");

  const res = await placeOrder(buyer, [{ ticketTypeId: ticket.id, quantity: count }]);
  expect(res.status).toBe(201);
  const codes = (res.body.data.tickets as { code: string }[]).map((t) => t.code);

  return { seller, event, buyer, codes };
}

const scan = (user: { id: string; email: string; role: "USER" | "SELLER" | "ADMIN" }, code: string) =>
  api().post("/api/v1/checkin").set(authHeader(user)).send({ code });

describe("check-in", () => {
  it("admits the holder once and rejects a second scan", async () => {
    const { seller, codes } = await setup();

    const first = await scan(seller.user, codes[0]);
    expect(first.status).toBe(200);
    expect(first.body.data.event).toBe("Test Event");

    const second = await scan(seller.user, codes[0]);
    expect(second.status).toBe(409);
    expect(second.body.message).toMatch(/already used/);
  });

  it("admits exactly one person when five scanners read the same code at once", async () => {
    const { seller, codes } = await setup();

    const results = await Promise.all(Array.from({ length: 5 }, () => scan(seller.user, codes[0])));

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
  });

  it("only lets the event's own seller, or an admin, scan its tickets", async () => {
    const { codes } = await setup(2);
    const otherSeller = await createSeller();
    const buyer = await createUser("USER");
    const admin = await createUser("ADMIN");

    expect((await scan(otherSeller.user, codes[0])).status).toBe(403);
    expect((await scan(buyer, codes[0])).status).toBe(403);
    expect((await scan(admin, codes[0])).status).toBe(200);
  });

  it("rejects unknown codes and voided tickets", async () => {
    const { seller, codes } = await setup();

    expect((await scan(seller.user, "this-code-does-not-exist")).status).toBe(404);

    await prisma.ticket.updateMany({ where: { code: codes[0] }, data: { status: "VOID" } });
    const voided = await scan(seller.user, codes[0]);
    expect(voided.status).toBe(409);
    expect(voided.body.message).toMatch(/void/i);
  });

  it("stops a suspended seller from scanning", async () => {
    const { seller, codes } = await setup();
    await prisma.sellerProfile.update({ where: { id: seller.profile.id }, data: { status: "SUSPENDED" } });

    expect((await scan(seller.user, codes[0])).status).toBe(403);
  });

  it("requires login", async () => {
    const res = await api().post("/api/v1/checkin").send({ code: "anything-long-enough" });
    expect(res.status).toBe(401);
  });
});
// ==========================================
// END OF FILE: backend/tests/checkin.test.ts
// ==========================================