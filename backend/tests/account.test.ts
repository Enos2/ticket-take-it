// ==========================================
// FILE: backend/tests/account.test.ts
// PURPOSE: Editing a profile, agreeing to the terms, and deleting an account safely.
// ==========================================
import { beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { prisma } from "../src/config/database";
import { hashPassword } from "../src/utils/password";
import { api, authHeader, createEventWithTicket, createSeller, createUser, placeOrder, resetDb, setupPaidOrder } from "./helpers";

beforeEach(resetDb);

type Actor = { id: string; email: string; role: Role };

async function withPassword(user: Actor) {
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword("Passw0rdTest") } });
  return user;
}

const patchMe = (user: Actor, body: object) => api().patch("/api/v1/users/me").set(authHeader(user)).send(body);
const deleteMe = (user: Actor, password = "Passw0rdTest") =>
  api().post("/api/v1/users/me/delete").set(authHeader(user)).send({ password });

describe("editing a profile", () => {
  it("changes the name and phone, and clears the phone with null", async () => {
    const user = await createUser("USER");

    const res = await patchMe(user, { fullName: "  Amina Otieno ", phone: "0712 345 678" });
    expect(res.status).toBe(200);
    expect(res.body.data.fullName).toBe("Amina Otieno");
    expect(res.body.data.phone).toBe("0712 345 678");

    const me = await api().get("/api/v1/users/me").set(authHeader(user));
    expect(me.body.data.fullName).toBe("Amina Otieno");

    const cleared = await patchMe(user, { phone: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.phone).toBeNull();
    expect(cleared.body.data.fullName).toBe("Amina Otieno"); // untouched
  });

  it("rejects bad input and anonymous requests, and can't change the role or email", async () => {
    const user = await createUser("USER");

    expect((await patchMe(user, { fullName: "A" })).status).toBe(400);
    expect((await patchMe(user, { phone: "call me" })).status).toBe(400);
    expect((await patchMe(user, {})).status).toBe(400);
    expect((await api().patch("/api/v1/users/me").send({ fullName: "No Login" })).status).toBe(401);

    const sneaky = await patchMe(user, { fullName: "Still Me", role: "ADMIN", email: "someone@else.dev" });
    expect(sneaky.status).toBe(200);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.role).toBe("USER");
    expect(row.email).toBe(user.email);
  });
});

describe("agreeing to the terms", () => {
  const creds = { email: "terms@test.dev", password: "Passw0rdTest", fullName: "Terms Tester" };

  it("saves when the person agreed, and leaves it empty when they didn't say", async () => {
    await api().post("/api/v1/auth/register").send({ ...creds, acceptedTerms: true });
    const agreed = await prisma.user.findUniqueOrThrow({ where: { email: creds.email } });
    expect(agreed.termsAcceptedAt).not.toBeNull();

    await api().post("/api/v1/auth/register").send({ ...creds, email: "other@test.dev" });
    const silent = await prisma.user.findUniqueOrThrow({ where: { email: "other@test.dev" } });
    expect(silent.termsAcceptedAt).toBeNull();
  });
});

describe("deleting an account", () => {
  it("needs the right password and changes nothing otherwise", async () => {
    const user = await withPassword(await createUser("USER"));

    const res = await deleteMe(user, "WrongPassw0rd");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/password/);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.isActive).toBe(true);
    expect(row.email).toBe(user.email);

    expect((await api().post("/api/v1/users/me/delete").send({ password: "Passw0rdTest" })).status).toBe(401);
  });

  it("erases who the person is, ends their sessions, keeps their order records, and frees the email", async () => {
    const { buyer, order, event } = await setupPaidOrder();
    await withPassword(buyer);
    await prisma.refreshToken.create({ data: { token: "hash-of-a-session", userId: buyer.id, expiresAt: new Date(Date.now() + 60_000) } });
    await prisma.auditLog.create({ data: { actorId: buyer.id, actorEmail: buyer.email, action: "test.action", summary: "x", ip: "1.2.3.4" } });

    // Their tickets are only for an event that has already ended, so nothing blocks the deletion.
    await prisma.event.update({ where: { id: event.id }, data: { startsAt: new Date(Date.now() - 6 * 3_600_000), endsAt: new Date(Date.now() - 3_600_000) } });

    const res = await deleteMe(buyer);
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } });
    expect(row.email).toBe(`deleted-${buyer.id}@deleted.invalid`);
    expect(row.fullName).toBe("Deleted user");
    expect(row.phone).toBeNull();
    expect(row.isActive).toBe(false);
    expect(row.deletedAt).not.toBeNull();

    expect(await prisma.refreshToken.count({ where: { userId: buyer.id } })).toBe(0);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { actorId: buyer.id } });
    expect(log.actorEmail).toBeNull();
    expect(log.ip).toBeNull();

    // The money record survives.
    const kept = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(kept.userId).toBe(buyer.id);
    expect(kept.status).toBe("PAID");

    // Their old login is dead, and the email can sign up again.
    expect((await api().get("/api/v1/users/me").set(authHeader(buyer))).status).toBe(401);
    expect((await api().post("/api/v1/auth/login").send({ email: buyer.email, password: "Passw0rdTest" })).status).toBe(401);
    const again = await api().post("/api/v1/auth/register").send({ email: buyer.email, password: "Passw0rdTest", fullName: "Fresh Start" });
    expect(again.status).toBe(201);
  });

  it("is blocked while the person holds tickets for an upcoming event, or has an order awaiting payment", async () => {
    const seller = await createSeller();
    const free = await createEventWithTicket({ sellerProfileId: seller.profile.id, priceCents: 0 });
    const holder = await withPassword(await createUser("USER"));
    expect((await placeOrder(holder, [{ ticketTypeId: free.ticket.id, quantity: 1 }])).status).toBe(201);

    const blocked = await deleteMe(holder);
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toMatch(/ticket/);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: holder.id } })).isActive).toBe(true);

    const paid = await createEventWithTicket({ sellerProfileId: seller.profile.id, priceCents: 100_000 });
    const waiting = await withPassword(await createUser("USER"));
    expect((await placeOrder(waiting, [{ ticketTypeId: paid.ticket.id, quantity: 1 }])).status).toBe(201);
    const unpaid = await deleteMe(waiting);
    expect(unpaid.status).toBe(400);
    expect(unpaid.body.message).toMatch(/waiting for payment/);
  });

  it("is blocked for a seller with a live event or a balance, then works and clears their business details", async () => {
    const seller = await createSeller();
    await withPassword(seller.user);
    const { event } = await createEventWithTicket({ sellerProfileId: seller.profile.id });

    const live = await deleteMe(seller.user);
    expect(live.status).toBe(400);
    expect(live.body.message).toMatch(/events/);

    await prisma.event.update({ where: { id: event.id }, data: { startsAt: new Date(Date.now() - 6 * 3_600_000), endsAt: new Date(Date.now() - 3_600_000) } });
    await prisma.sellerProfile.update({ where: { id: seller.profile.id }, data: { payoutMethod: "MPESA", payoutDetails: "254712345678" } });
    await prisma.ledgerEntry.create({ data: { sellerId: seller.profile.id, type: "SALE", amountCents: 100_000, currency: "KES", availableAt: new Date() } });

    const owed = await deleteMe(seller.user);
    expect(owed.status).toBe(400);
    expect(owed.body.message).toMatch(/balance/);

    // Once the balance is settled, the deletion goes through.
    await prisma.ledgerEntry.create({ data: { sellerId: seller.profile.id, type: "PAYOUT", amountCents: -100_000, currency: "KES", availableAt: new Date() } });
    expect((await deleteMe(seller.user)).status).toBe(200);

    const profile = await prisma.sellerProfile.findUniqueOrThrow({ where: { id: seller.profile.id } });
    expect(profile.businessName).toBe("Deleted seller");
    expect(profile.payoutDetails).toBeNull();
    expect(profile.payoutMethod).toBeNull();
    expect(profile.status).toBe("SUSPENDED");
  });

  it("is not available to administrators", async () => {
    const admin = await withPassword(await createUser("ADMIN"));
    const res = await deleteMe(admin);
    expect(res.status).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).isActive).toBe(true);
  });
});
// ==========================================
// END OF FILE: backend/tests/account.test.ts
// ==========================================