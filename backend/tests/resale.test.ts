// ==========================================
// FILE: backend/tests/resale.test.ts
// PURPOSE: Ticket resale: price cap, one buyer at a time, safe ownership change, failed sales and payouts.
// ==========================================
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/config/database";
import { api, authHeader, createSeller, createUser, payOrder, resetDb, setupPaidOrder } from "./helpers";

beforeEach(resetDb);

type Person = { id: string; email: string; role: "USER" | "SELLER" | "ADMIN" };

const list = (who: Person, ticketId: string, priceCents: number, payoutPhone = "0712 345 678") =>
  api().post("/api/v1/resale/listings").set(authHeader(who)).send({ ticketId, priceCents, payoutPhone });

const buy = (who: Person, listingId: string) => api().post(`/api/v1/resale/listings/${listingId}/buy`).set(authHeader(who));

// A buyer who owns one paid ticket, for an event that allows resale up to the original price.
async function setup(maxPercent = 100) {
  const paid = await setupPaidOrder({ quantity: 1, stock: 5 });
  const ticket = await prisma.ticket.findFirstOrThrow({ where: { userId: paid.buyer.id }, include: { orderItem: true } });
  await prisma.event.update({ where: { id: ticket.eventId }, data: { resaleEnabled: true, resaleMaxPercent: maxPercent } });
  const buyer = await createUser("USER");
  return { seller: paid.buyer, ticket, face: ticket.orderItem.unitPriceCents, buyer };
}

describe("listing a ticket", () => {
  it("needs the organiser to allow resale", async () => {
    const { seller, ticket, face } = await setup();
    await prisma.event.update({ where: { id: ticket.eventId }, data: { resaleEnabled: false } });

    expect((await list(seller, ticket.id, face)).status).toBe(400);
  });

  it("never lets the price go above the cap", async () => {
    const { seller, ticket, face } = await setup(100);

    expect((await list(seller, ticket.id, face + 100)).status).toBe(400);
    expect((await list(seller, ticket.id, face + 50)).status).toBe(400); // KES needs whole shillings
    expect((await list(seller, ticket.id, face)).status).toBe(201);
  });

  it("follows the organiser's own cap", async () => {
    const { seller, ticket, face } = await setup(150);

    expect((await list(seller, ticket.id, Math.floor((face * 1.5) / 100) * 100)).status).toBe(201);
  });

  it("only works for the holder, once per ticket, and never for free tickets", async () => {
    const { seller, ticket, face, buyer } = await setup();

    expect((await list(buyer, ticket.id, face)).status).toBe(404); // not their ticket
    const first = await list(seller, ticket.id, face);
    expect(first.status).toBe(201);
    expect((await list(seller, ticket.id, face)).status).toBe(409); // already listed

    // Cancelling frees the ticket for a new listing.
    expect((await api().delete(`/api/v1/resale/listings/${first.body.data.id}`).set(authHeader(seller))).status).toBe(200);
    expect((await list(seller, ticket.id, face)).status).toBe(201);

    await prisma.order.updateMany({ where: { id: ticket.orderId }, data: { isComp: true } });
    await prisma.resaleListing.updateMany({ data: { status: "CANCELLED" } });
    expect((await list(seller, ticket.id, face)).status).toBe(400);
  });
});

describe("buying a listed ticket", () => {
  it("shows the offer without saying who sells it", async () => {
    const { seller, ticket, face } = await setup();
    await list(seller, ticket.id, face);

    const res = await api().get(`/api/v1/resale/events/${ticket.eventId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.listings).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain(seller.email);
    expect(JSON.stringify(res.body)).not.toContain(seller.id);
  });

  it("holds the ticket for one buyer at a time, and not for its own seller", async () => {
    const { seller, ticket, face, buyer } = await setup();
    const other = await createUser("USER");
    const listing = await list(seller, ticket.id, face);

    expect((await buy(seller, listing.body.data.id)).status).toBe(400); // their own ticket

    const first = await buy(buyer, listing.body.data.id);
    expect(first.status).toBe(201);
    expect(first.body.data.totalCents).toBe(face);
    expect((await buy(other, listing.body.data.id)).status).toBe(409);

    // The hold runs out, then somebody else can reserve it.
    await prisma.resaleListing.update({ where: { id: listing.body.data.id }, data: { reservedUntil: new Date(Date.now() - 1000) } });
    expect((await buy(other, listing.body.data.id)).status).toBe(201);
  });

  it("moves the ticket, replaces its QR code and records what the seller is owed", async () => {
    const { seller, ticket, face, buyer } = await setup();
    const admin = await createUser("ADMIN");
    const listing = await list(seller, ticket.id, face);
    const order = await buy(buyer, listing.body.data.id);

    expect((await payOrder(order.body.data)).status).toBe(200);

    const moved = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(moved.userId).toBe(buyer.id);
    expect(moved.code).not.toBe(ticket.code);
    expect(moved.transferCount).toBe(1);

    const sold = await prisma.resaleListing.findUniqueOrThrow({ where: { id: listing.body.data.id } });
    expect(sold.status).toBe("SOLD");
    expect(sold.payoutStatus).toBe("OWED");
    expect((sold.feeCents ?? 0) + (sold.netCents ?? 0)).toBe(face);

    // The organiser earns nothing from a resale.
    expect(await prisma.ledgerEntry.count({ where: { orderId: order.body.data.id } })).toBe(0);

    // The seller no longer sees the ticket, and the buyer does.
    const mine = await api().get("/api/v1/orders/my-tickets").set(authHeader(buyer));
    expect(mine.body.data.map((t: { id: string }) => t.id)).toContain(ticket.id);

    // The admin pays the seller out.
    const owed = await api().get("/api/v1/resale/admin/owed").set(authHeader(admin));
    expect(owed.body.data).toHaveLength(1);
    expect((await api().post(`/api/v1/resale/admin/listings/${listing.body.data.id}/paid`).set(authHeader(admin)).send({ reference: "QWE123" })).status).toBe(200);
    expect((await prisma.resaleListing.findUniqueOrThrow({ where: { id: listing.body.data.id } })).payoutStatus).toBe("PAID");
  });
});

describe("a sale that cannot be completed", () => {
  it("flags the payment for a refund when the ticket was used first", async () => {
    const { seller, ticket, face, buyer } = await setup();
    const listing = await list(seller, ticket.id, face);
    const order = await buy(buyer, listing.body.data.id);

    await prisma.ticket.update({ where: { id: ticket.id }, data: { status: "USED", usedAt: new Date() } });
    await payOrder(order.body.data);

    const payments = await prisma.payment.findMany({ where: { orderId: order.body.data.id } });
    expect(payments.some((p) => (p.metadata as { needsRefund?: boolean } | null)?.needsRefund === true)).toBe(true);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).userId).toBe(seller.id);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.body.data.id } })).status).not.toBe("PAID");
  });

  it("flags the payment for a refund when the listing was cancelled after the hold ran out", async () => {
    const { seller, ticket, face, buyer } = await setup();
    const listing = await list(seller, ticket.id, face);
    const order = await buy(buyer, listing.body.data.id);

    // While a buyer is paying, the seller cannot pull the listing.
    expect((await api().delete(`/api/v1/resale/listings/${listing.body.data.id}`).set(authHeader(seller))).status).toBe(409);

    await prisma.resaleListing.update({ where: { id: listing.body.data.id }, data: { reservedUntil: new Date(Date.now() - 1000) } });
    expect((await api().delete(`/api/v1/resale/listings/${listing.body.data.id}`).set(authHeader(seller))).status).toBe(200);

    await payOrder(order.body.data);

    const payments = await prisma.payment.findMany({ where: { orderId: order.body.data.id } });
    expect(payments.some((p) => (p.metadata as { needsRefund?: boolean } | null)?.needsRefund === true)).toBe(true);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).userId).toBe(seller.id);
  });
});

describe("organiser settings", () => {
  it("lets only the event owner change them", async () => {
    const seller = await createSeller();
    const paid = await setupPaidOrder({ quantity: 1, stock: 5 });
    const ticket = await prisma.ticket.findFirstOrThrow({ where: { userId: paid.buyer.id } });
    const owner = await prisma.event.findUniqueOrThrow({ where: { id: ticket.eventId }, include: { seller: { include: { user: true } } } });
    const ownerUser = { id: owner.seller.user.id, email: owner.seller.user.email, role: owner.seller.user.role } as Person;

    const url = `/api/v1/resale/events/${ticket.eventId}/settings`;
    expect((await api().put(url).set(authHeader(seller.user)).send({ enabled: true, maxPercent: 120 })).status).toBe(403);

    const ok = await api().put(url).set(authHeader(ownerUser)).send({ enabled: true, maxPercent: 120 });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ enabled: true, maxPercent: 120 });
  });
});
// ==========================================
// END OF FILE: backend/tests/resale.test.ts
// ==========================================