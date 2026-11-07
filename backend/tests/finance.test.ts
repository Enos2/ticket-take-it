// ==========================================
// FILE: backend/tests/finance.test.ts
// PURPOSE: Commission, the ledger, holds, refunds, payouts, payout details and access rules.
// ==========================================
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/config/database";
import { postRefundEntries, postSaleEntries, reconcileLedger } from "../src/modules/finance/ledger.service";
import { hashPassword } from "../src/utils/password";
import { api, authHeader, createEventWithTicket, createSeller, createUser, payOrder, placeOrder, resetDb, setupPaidOrder } from "./helpers";

beforeEach(resetDb);

const DAY = 24 * 60 * 60 * 1000;

// Posts the order and treats its money as past the hold, so it can be paid out.
async function makeAvailable(orderId: string) {
  await postSaleEntries(orderId);
  await prisma.ledgerEntry.updateMany({ where: { orderId }, data: { availableAt: new Date(Date.now() - 1000) } });
}

const earningsOf = async (user: { id: string; email: string; role: "USER" | "SELLER" | "ADMIN" }) =>
  (await api().get("/api/v1/finance/earnings").set(authHeader(user))).body.data;

describe("commission and the hold", () => {
  it("takes 5% from the sale and holds the rest until a few days after the event ends", async () => {
    const { sellerUser, order, event } = await setupPaidOrder({ quantity: 2, priceCents: 100_000 }); // 200,000 gross
    await postSaleEntries(order.id);

    const entries = await prisma.ledgerEntry.findMany({ where: { orderId: order.id } });
    const sale = entries.find((e) => e.type === "SALE");
    const fee = entries.find((e) => e.type === "FEE");
    expect(sale?.amountCents).toBe(200_000);
    expect(fee?.amountCents).toBe(-10_000);
    expect(fee?.feeBps).toBe(500);

    // Available three days after the event ends.
    const wait = sale!.availableAt.getTime() - (event.endsAt.getTime() + 3 * DAY);
    expect(Math.abs(wait)).toBeLessThan(1000);

    const data = await earningsOf(sellerUser);
    expect(data.currencies).toHaveLength(1);
    expect(data.currencies[0]).toMatchObject({
      currency: "KES",
      grossCents: 200_000,
      feesCents: 10_000,
      pendingCents: 190_000,
      availableCents: 0,
      paidOutCents: 0,
    });
    expect(data.feeBps).toBe(500);
    expect(data.holdDays).toBe(3);
  });

  it("moves the money to available once the hold has passed", async () => {
    const { sellerUser, order } = await setupPaidOrder({ quantity: 2, priceCents: 100_000 });
    await makeAvailable(order.id);

    const data = await earningsOf(sellerUser);
    expect(data.currencies[0]).toMatchObject({ pendingCents: 0, availableCents: 190_000 });
  });

  it("uses a seller's own rate when an admin has set one", async () => {
    const seller = await createSeller();
    await prisma.sellerProfile.update({ where: { id: seller.profile.id }, data: { feeBps: 1000 } }); // 10%
    const { ticket } = await createEventWithTicket({ sellerProfileId: seller.profile.id, priceCents: 100_000, quantity: 10 });
    const buyer = await createUser("USER");
    const order = (await placeOrder(buyer, [{ ticketTypeId: ticket.id, quantity: 2 }])).body.data;
    await payOrder(order);
    await postSaleEntries(order.id);

    const fee = await prisma.ledgerEntry.findFirstOrThrow({ where: { orderId: order.id, type: "FEE" } });
    expect(fee.amountCents).toBe(-20_000);
    expect(fee.feeBps).toBe(1000);
  });

  it("charges nothing on free tickets", async () => {
    const seller = await createSeller();
    const { ticket } = await createEventWithTicket({ sellerProfileId: seller.profile.id, priceCents: 0 });
    const buyer = await createUser("USER");
    const order = (await placeOrder(buyer, [{ ticketTypeId: ticket.id, quantity: 2 }])).body.data;

    expect(await postSaleEntries(order.id)).toBe(0);
    expect(await prisma.ledgerEntry.count()).toBe(0);
  });

  it("posts an order only once, however often it is asked", async () => {
    const { order } = await setupPaidOrder();
    await Promise.all([postSaleEntries(order.id), postSaleEntries(order.id), postSaleEntries(order.id)]);

    expect(await prisma.ledgerEntry.count({ where: { orderId: order.id, type: "SALE" } })).toBe(1);
    expect(await prisma.ledgerEntry.count({ where: { orderId: order.id, type: "FEE" } })).toBe(1);
  });

  it("repairs a missing ledger by itself", async () => {
    const { order } = await setupPaidOrder();
    await postSaleEntries(order.id);
    await prisma.ledgerEntry.deleteMany({ where: { orderId: order.id } });

    await reconcileLedger();
    expect(await prisma.ledgerEntry.count({ where: { orderId: order.id } })).toBe(2);
  });
});

describe("refunds", () => {
  it("reverse the sale and the commission, so the order nets to nothing", async () => {
    const admin = await createUser("ADMIN");
    const { sellerUser, order } = await setupPaidOrder({ quantity: 2, priceCents: 100_000 });
    await makeAvailable(order.id);

    const refund = await api().post(`/api/v1/admin/orders/${order.id}/refund`).set(authHeader(admin)).send({});
    expect(refund.status).toBe(200);
    await postRefundEntries(order.id);

    const types = (await prisma.ledgerEntry.findMany({ where: { orderId: order.id } })).map((e) => e.type).sort();
    expect(types).toEqual(["FEE", "FEE_REFUND", "REFUND", "SALE"]);

    const sum = await prisma.ledgerEntry.aggregate({ where: { orderId: order.id }, _sum: { amountCents: true } });
    expect(sum._sum.amountCents).toBe(0);

    const data = await earningsOf(sellerUser);
    expect(data.currencies[0]).toMatchObject({ grossCents: 0, feesCents: 0, pendingCents: 0, availableCents: 0 });
  });
});

describe("payouts", () => {
  const record = (admin: { id: string; email: string; role: "USER" | "SELLER" | "ADMIN" }, sellerId: string, body: object = {}) =>
    api().post("/api/v1/finance/admin/payouts").set(authHeader(admin)).send({ sellerId, currency: "KES", method: "MPESA", ...body });

  it("pays out up to what is available, never more, and never the same money twice", async () => {
    const admin = await createUser("ADMIN");
    const { profile, order, sellerUser } = await setupPaidOrder({ quantity: 2, priceCents: 100_000 });
    await makeAvailable(order.id);

    expect((await record(admin, profile.id, { amountCents: 500_000 })).status).toBe(400); // more than available

    const first = await record(admin, profile.id, { amountCents: 90_000, reference: "QWE123" });
    expect(first.status).toBe(201);
    expect(first.body.data.amountCents).toBe(90_000);

    const rest = await record(admin, profile.id); // no amount means everything that is left
    expect(rest.status).toBe(201);
    expect(rest.body.data.amountCents).toBe(100_000);

    expect((await record(admin, profile.id)).status).toBe(400); // nothing left

    const data = await earningsOf(sellerUser);
    expect(data.currencies[0]).toMatchObject({ availableCents: 0, paidOutCents: 190_000 });
  });

  it("lets only one of several simultaneous payouts through", async () => {
    const admin = await createUser("ADMIN");
    const { profile, order } = await setupPaidOrder({ quantity: 2, priceCents: 100_000 });
    await makeAvailable(order.id);

    const results = await Promise.all([record(admin, profile.id), record(admin, profile.id), record(admin, profile.id)]);

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await prisma.payout.count({ where: { sellerId: profile.id } })).toBe(1);
  });

  it("is paused for a seller who is not active", async () => {
    const admin = await createUser("ADMIN");
    const { profile, order } = await setupPaidOrder();
    await makeAvailable(order.id);
    await prisma.sellerProfile.update({ where: { id: profile.id }, data: { status: "SUSPENDED" } });

    const res = await record(admin, profile.id);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/paused/);
  });

  it("shows admins who is owed what, and the platform's commission", async () => {
    const admin = await createUser("ADMIN");
    const { profile, order } = await setupPaidOrder({ quantity: 2, priceCents: 100_000 });
    await makeAvailable(order.id);

    const res = await api().get("/api/v1/finance/admin/balances?onlyDue=true").set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.data.rows).toHaveLength(1);
    expect(res.body.data.rows[0]).toMatchObject({ sellerId: profile.id, availableCents: 190_000 });
    expect(res.body.data.rows[0].seller.businessName).toBeTruthy();
    expect(res.body.data.totals[0]).toMatchObject({ currency: "KES", grossCents: 200_000, commissionCents: 10_000, owedCents: 190_000 });
  });
});

describe("commission rates", () => {
  it("can be set per seller by an admin, and reset to the default", async () => {
    const admin = await createUser("ADMIN");
    const { profile } = await createSeller();
    const patch = (feeBps: number | null) =>
      api().patch(`/api/v1/finance/admin/sellers/${profile.id}/fee`).set(authHeader(admin)).send({ feeBps });

    expect((await patch(250)).status).toBe(200);
    expect((await prisma.sellerProfile.findUniqueOrThrow({ where: { id: profile.id } })).feeBps).toBe(250);

    expect((await patch(6000)).status).toBe(400); // over 50%
    expect((await patch(-1)).status).toBe(400);

    expect((await patch(null)).status).toBe(200);
    expect((await prisma.sellerProfile.findUniqueOrThrow({ where: { id: profile.id } })).feeBps).toBeNull();
  });
});

describe("payout details", () => {
  async function sellerWithPassword() {
    const seller = await createSeller();
    await prisma.user.update({ where: { id: seller.user.id }, data: { passwordHash: await hashPassword("Passw0rdTest") } });
    return seller;
  }

  it("needs the account password and a real number, and stores the number in one format", async () => {
    const seller = await sellerWithPassword();
    const patch = (body: object) => api().patch("/api/v1/finance/payout-details").set(authHeader(seller.user)).send(body);

    expect((await patch({ method: "MPESA", details: "0712 345 678", password: "WrongPassw0rd" })).status).toBe(400);
    expect((await patch({ method: "MPESA", details: "not a number", password: "Passw0rdTest" })).status).toBe(400);

    const ok = await patch({ method: "MPESA", details: "0712 345 678", password: "Passw0rdTest" });
    expect(ok.status).toBe(200);
    expect(ok.body.data.payoutDetails).toBe("254712345678");
    expect(ok.body.data.payoutUpdatedAt).toBeTruthy();

    const data = await earningsOf(seller.user);
    expect(data).toMatchObject({ payoutMethod: "MPESA", payoutDetails: "254712345678" });
  });
});

describe("who can see what", () => {
  it("keeps earnings for sellers and the payout tools for admins", async () => {
    const buyer = await createUser("USER");
    const admin = await createUser("ADMIN");
    const seller = await createSeller();

    expect((await api().get("/api/v1/finance/earnings")).status).toBe(401);
    expect((await api().get("/api/v1/finance/earnings").set(authHeader(buyer))).status).toBe(403);
    expect((await api().get("/api/v1/finance/earnings").set(authHeader(admin))).status).toBe(403);
    expect((await api().get("/api/v1/finance/earnings").set(authHeader(seller.user))).status).toBe(200);

    expect((await api().get("/api/v1/finance/admin/balances").set(authHeader(seller.user))).status).toBe(403);
    expect((await api().get("/api/v1/finance/admin/balances").set(authHeader(buyer))).status).toBe(403);
    expect(
      (await api().post("/api/v1/finance/admin/payouts").set(authHeader(seller.user)).send({ sellerId: seller.profile.id, currency: "KES", method: "MPESA" })).status
    ).toBe(403);
  });
});
// ==========================================
// END OF FILE: backend/tests/finance.test.ts
// ==========================================