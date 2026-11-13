// ==========================================
// FILE: backend/tests/transfers.test.ts
// PURPOSE: Ticket transfers: sending, accepting, declining, cancelling, expiry and safety rules.
// ==========================================
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/config/database";
import { expireTransfers } from "../src/modules/transfers/transfers.service";
import { api, authHeader, createUser, resetDb, setupPaidOrder } from "./helpers";

beforeEach(resetDb);

type Person = { id: string; email: string; role: "USER" | "SELLER" | "ADMIN" };

const send = (from: Person, ticketId: string, toEmail: string, message?: string) =>
  api().post("/api/v1/transfers").set(authHeader(from)).send({ ticketId, toEmail, message });

const act = (who: Person, transferId: string, action: "accept" | "decline" | "cancel") =>
  api().post(`/api/v1/transfers/${transferId}/${action}`).set(authHeader(who));

async function setup() {
  const paid = await setupPaidOrder({ quantity: 2, stock: 5 });
  const tickets = await prisma.ticket.findMany({ where: { userId: paid.buyer.id }, orderBy: { createdAt: "asc" } });
  const recipient = await createUser("USER");
  return { ...paid, tickets, recipient };
}

describe("ticket transfers", () => {
  it("moves the ticket to the recipient and replaces its QR code", async () => {
    const { buyer, tickets, recipient, order } = await setup();
    const ticket = tickets[0];

    const sent = await send(buyer, ticket.id, recipient.email, "See you there");
    expect(sent.status).toBe(201);
    expect(JSON.stringify(sent.body)).not.toContain(ticket.code); // a code is never returned by transfers

    const waiting = await api().get("/api/v1/transfers").set(authHeader(recipient));
    expect(waiting.body.data.incoming).toHaveLength(1);

    const accepted = await act(recipient, sent.body.data.id, "accept");
    expect(accepted.status).toBe(200);

    const moved = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(moved.userId).toBe(recipient.id);
    expect(moved.code).not.toBe(ticket.code);
    expect(moved.transferCount).toBe(1);

    // The buyer's order page no longer shows the ticket they gave away.
    const orderPage = await api().get(`/api/v1/orders/${order.id}`).set(authHeader(buyer));
    expect(orderPage.status).toBe(200);
    expect(orderPage.body.data.tickets).toHaveLength(1);
    expect(orderPage.body.data.tickets[0].id).toBe(tickets[1].id);

    const mine = await api().get("/api/v1/orders/my-tickets").set(authHeader(recipient));
    expect(mine.body.data.map((t: { id: string }) => t.id)).toContain(ticket.id);
  });

  it("refuses transfers that make no sense", async () => {
    const { buyer, tickets, recipient } = await setup();
    const stranger = await createUser("USER");

    expect((await send(buyer, tickets[0].id, buyer.email)).status).toBe(400); // to yourself
    expect((await send(stranger, tickets[0].id, recipient.email)).status).toBe(404); // not their ticket

    await prisma.ticket.update({ where: { id: tickets[1].id }, data: { status: "USED" } });
    expect((await send(buyer, tickets[1].id, recipient.email)).status).toBe(400); // already used

    await prisma.ticket.update({ where: { id: tickets[0].id }, data: { transferCount: 3 } });
    expect((await send(buyer, tickets[0].id, recipient.email)).status).toBe(400); // too many transfers
  });

  it("allows only one open transfer per ticket, and a cancelled one frees it", async () => {
    const { buyer, tickets, recipient } = await setup();
    const other = await createUser("USER");

    const first = await send(buyer, tickets[0].id, recipient.email);
    expect(first.status).toBe(201);
    expect((await send(buyer, tickets[0].id, other.email)).status).toBe(409);

    expect((await act(buyer, first.body.data.id, "cancel")).status).toBe(200);
    expect((await send(buyer, tickets[0].id, other.email)).status).toBe(201);
  });

  it("lets only the addressed person answer, and a decline keeps the ticket with the sender", async () => {
    const { buyer, tickets, recipient } = await setup();
    const stranger = await createUser("USER");

    const sent = await send(buyer, tickets[0].id, recipient.email);
    expect((await act(stranger, sent.body.data.id, "accept")).status).toBe(404);
    expect((await act(buyer, sent.body.data.id, "accept")).status).toBe(404);

    expect((await act(recipient, sent.body.data.id, "decline")).status).toBe(200);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: tickets[0].id } })).userId).toBe(buyer.id);
    expect((await send(buyer, tickets[0].id, recipient.email)).status).toBe(201); // can be sent again
  });

  it("will not give a ticket to an unverified email address", async () => {
    const { buyer, tickets } = await setup();
    const unverified = await createUser("USER", { emailVerified: false });

    const sent = await send(buyer, tickets[0].id, unverified.email);
    expect(sent.status).toBe(201);
    expect((await act(unverified, sent.body.data.id, "accept")).status).toBe(403);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: tickets[0].id } })).userId).toBe(buyer.id);
  });

  it("rejects an expired offer and the clean-up job closes it", async () => {
    const { buyer, tickets, recipient } = await setup();

    const sent = await send(buyer, tickets[0].id, recipient.email);
    await prisma.ticketTransfer.update({ where: { id: sent.body.data.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    expect((await act(recipient, sent.body.data.id, "accept")).status).toBe(400);
    expect((await prisma.ticketTransfer.findUniqueOrThrow({ where: { id: sent.body.data.id } })).status).toBe("EXPIRED");

    const again = await send(buyer, tickets[1].id, recipient.email);
    await prisma.ticketTransfer.update({ where: { id: again.body.data.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await expireTransfers()).toBe(1);
  });

  it("cancels the transfer when the ticket was used before it was accepted", async () => {
    const { buyer, tickets, recipient } = await setup();

    const sent = await send(buyer, tickets[0].id, recipient.email);
    await prisma.ticket.update({ where: { id: tickets[0].id }, data: { status: "USED", usedAt: new Date() } });

    expect((await act(recipient, sent.body.data.id, "accept")).status).toBe(409);
    expect((await prisma.ticketTransfer.findUniqueOrThrow({ where: { id: sent.body.data.id } })).status).toBe("CANCELLED");
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: tickets[0].id } })).userId).toBe(buyer.id);
  });
});
// ==========================================
// END OF FILE: backend/tests/transfers.test.ts
// ==========================================