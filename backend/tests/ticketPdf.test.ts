// ==========================================
// FILE: backend/tests/ticketPdf.test.ts
// PURPOSE: PDF tickets: who can download, what is refused, and that the file is a real PDF.
// ==========================================
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/config/database";
import { api, authHeader, createUser, resetDb, setupPaidOrder } from "./helpers";

beforeEach(resetDb);

type Person = { id: string; email: string; role: "USER" | "SELLER" | "ADMIN" };

// supertest reads unknown content types as text. This keeps the raw bytes.
const binary = (res: unknown, done: (err: Error | null, body: Buffer) => void) => {
  const stream = res as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  stream.on("data", (chunk: Buffer) => chunks.push(chunk));
  stream.on("end", () => done(null, Buffer.concat(chunks)));
};

const download = (user: Person, path: string) => api().get(path).set(authHeader(user)).buffer(true).parse(binary);

const pages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;

describe("PDF tickets", () => {
  it("gives the holder a real PDF that is never cached", async () => {
    const { buyer } = await setupPaidOrder({ quantity: 2, stock: 5 });
    const ticket = await prisma.ticket.findFirstOrThrow({ where: { userId: buyer.id } });

    const res = await download(buyer, `/api/v1/tickets/${ticket.id}/pdf`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect((res.body as Buffer).subarray(0, 4).toString()).toBe("%PDF");
    expect(pages(res.body as Buffer)).toBe(1);
  });

  it("refuses anyone who does not hold the ticket, and signed-out visitors", async () => {
    const { buyer } = await setupPaidOrder({ quantity: 1, stock: 5 });
    const stranger = await createUser("USER");
    const ticket = await prisma.ticket.findFirstOrThrow({ where: { userId: buyer.id } });

    expect((await download(stranger, `/api/v1/tickets/${ticket.id}/pdf`)).status).toBe(404);
    expect((await api().get(`/api/v1/tickets/${ticket.id}/pdf`)).status).toBe(401);
  });

  it("does not print a voided ticket", async () => {
    const { buyer } = await setupPaidOrder({ quantity: 1, stock: 5 });
    const ticket = await prisma.ticket.findFirstOrThrow({ where: { userId: buyer.id } });
    await prisma.ticket.update({ where: { id: ticket.id }, data: { status: "VOID" } });

    expect((await download(buyer, `/api/v1/tickets/${ticket.id}/pdf`)).status).toBe(400);
  });

  it("puts every ticket of an order on its own page", async () => {
    const { buyer, order } = await setupPaidOrder({ quantity: 3, stock: 5 });

    const res = await download(buyer, `/api/v1/tickets/order/${order.id}/pdf`);

    expect(res.status).toBe(200);
    expect(pages(res.body as Buffer)).toBe(3);
  });

  it("stops the old holder from downloading a ticket that moved to someone else", async () => {
    const { buyer, order } = await setupPaidOrder({ quantity: 2, stock: 5 });
    const recipient = await createUser("USER");
    const moved = await prisma.ticket.findFirstOrThrow({ where: { userId: buyer.id }, orderBy: { id: "asc" } });
    await prisma.ticket.update({ where: { id: moved.id }, data: { userId: recipient.id } });

    expect((await download(buyer, `/api/v1/tickets/${moved.id}/pdf`)).status).toBe(404);
    expect((await download(recipient, `/api/v1/tickets/${moved.id}/pdf`)).status).toBe(200);

    // The buyer's whole-order download now holds only the ticket they kept.
    const all = await download(buyer, `/api/v1/tickets/order/${order.id}/pdf`);
    expect(pages(all.body as Buffer)).toBe(1);
  });
});
// ==========================================
// END OF FILE: backend/tests/ticketPdf.test.ts
// ==========================================