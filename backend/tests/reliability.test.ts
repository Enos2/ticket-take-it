// ==========================================
// FILE: backend/tests/reliability.test.ts
// PURPOSE: The email queue and its retries, the audit log, system health, browser crash reports and receipts.
// ==========================================
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/config/database";
import { env } from "../src/config/env";
import { processEmailOutbox } from "../src/modules/system/outbox.service";
import { sendEmail } from "../src/utils/email";
import { hashPassword } from "../src/utils/password";
import { api, authHeader, createEventWithTicket, createSeller, createUser, placeOrder, resetDb, setupPaidOrder } from "./helpers";

beforeEach(resetDb);

afterEach(() => {
  env.RESEND_API_KEY = undefined;
  vi.unstubAllGlobals();
});

// Replaces the call to Resend. Each answer is the next status code in the list, and the last one repeats.
function stubResend(...statuses: number[]) {
  const calls: number[] = [];
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const status = statuses[Math.min(i++, statuses.length - 1)];
      calls.push(status);
      return new Response(status === 200 ? '{"id":"abc"}' : '{"message":"nope"}', { status });
    })
  );
  return calls;
}

const message = { to: "buyer@test.dev", subject: "Hello", html: "<p>Hi</p>", text: "Hi" };
const makeDue = (id: string) => prisma.emailOutbox.update({ where: { id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });

describe("the email queue", () => {
  it("keeps an email that failed and sends it on a later try", async () => {
    env.RESEND_API_KEY = "re_test_key";
    const calls = stubResend(500, 200);

    expect(await sendEmail(message)).toBe(false);

    let row = await prisma.emailOutbox.findFirstOrThrow();
    expect(row.status).toBe("PENDING");
    expect(row.attempts).toBe(1);
    expect(row.lastError).toMatch(/500/);
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    expect(await processEmailOutbox()).toBe(0); // not due yet, so nothing is sent

    await makeDue(row.id);
    expect(await processEmailOutbox()).toBe(1);

    row = await prisma.emailOutbox.findFirstOrThrow();
    expect(row.status).toBe("SENT");
    expect(row.attempts).toBe(2);
    expect(row.html).toBe(""); // the text is wiped once sent
    expect(calls).toEqual([500, 200]);
  });

  it("gives up straight away on a permanent refusal", async () => {
    env.RESEND_API_KEY = "re_test_key";
    const calls = stubResend(422);

    expect(await sendEmail(message)).toBe(false);

    const row = await prisma.emailOutbox.findFirstOrThrow();
    expect(row.status).toBe("FAILED");
    expect(row.attempts).toBe(1);

    await processEmailOutbox();
    expect(calls).toEqual([422]); // never tried again
  });

  it("gives up after the last retry", async () => {
    env.RESEND_API_KEY = "re_test_key";
    stubResend(503);

    const row = await prisma.emailOutbox.create({
      data: { toEmail: message.to, subject: message.subject, html: message.html, text: message.text, attempts: 5, nextAttemptAt: new Date(Date.now() - 1000) },
    });

    await processEmailOutbox();

    const after = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.status).toBe("FAILED");
    expect(after.attempts).toBe(6);
  });

  it("never stores an email that carries a secret link", async () => {
    env.RESEND_API_KEY = "re_test_key";
    stubResend(200);

    expect(await sendEmail(message, { persist: false })).toBe(true);
    expect(await prisma.emailOutbox.count()).toBe(0);
  });

  it("does nothing, and stores nothing, when email is not set up", async () => {
    expect(await sendEmail(message)).toBe(false);
    expect(await prisma.emailOutbox.count()).toBe(0);
  });

  it("lets an admin put a failed email back in the queue, but not a sent one", async () => {
    const admin = await createUser("ADMIN");
    const buyer = await createUser("USER");
    const failed = await prisma.emailOutbox.create({
      data: { toEmail: message.to, subject: message.subject, html: message.html, text: message.text, status: "FAILED", attempts: 6, lastError: "Resend 503" },
    });
    const sent = await prisma.emailOutbox.create({
      data: { toEmail: message.to, subject: message.subject, html: "", text: "", status: "SENT", attempts: 1 },
    });

    expect((await api().post(`/api/v1/system/emails/${failed.id}/retry`).set(authHeader(buyer))).status).toBe(403);
    expect((await api().post(`/api/v1/system/emails/${sent.id}/retry`).set(authHeader(admin))).status).toBe(400);

    const ok = await api().post(`/api/v1/system/emails/${failed.id}/retry`).set(authHeader(admin));
    expect(ok.status).toBe(200);

    const row = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: failed.id } });
    expect(row.status).toBe("PENDING");
    expect(row.attempts).toBe(0);
  });
});

describe("the audit log", () => {
  it("records who approved a seller, and can be searched and filtered", async () => {
    const admin = await createUser("ADMIN");
    const { profile } = await createSeller("PENDING");

    const res = await api().patch(`/api/v1/admin/sellers/${profile.id}/status`).set(authHeader(admin)).send({ status: "APPROVED" });
    expect(res.status).toBe(200);

    const row = await prisma.auditLog.findFirstOrThrow({ where: { action: "seller.status" } });
    expect(row.actorEmail).toBe(admin.email);
    expect(row.actorRole).toBe("ADMIN");
    expect(row.targetId).toBe(profile.id);
    expect(row.summary).toContain(profile.businessName);

    const byAction = await api().get("/api/v1/system/audit?action=seller.").set(authHeader(admin));
    expect(byAction.status).toBe(200);
    expect(byAction.body.data).toHaveLength(1);

    const byActor = await api().get(`/api/v1/system/audit?q=${encodeURIComponent(admin.email)}`).set(authHeader(admin));
    expect(byActor.body.data).toHaveLength(1);

    const none = await api().get("/api/v1/system/audit?action=event.").set(authHeader(admin));
    expect(none.body.data).toHaveLength(0);
  });

  it("records refunds and event reviews", async () => {
    const admin = await createUser("ADMIN");
    const { order, sellerUser, event } = await setupPaidOrder();

    await api().post(`/api/v1/admin/orders/${order.id}/refund`).set(authHeader(admin)).send({});
    expect(await prisma.auditLog.count({ where: { action: "order.refund", targetId: order.id } })).toBe(1);

    await api().post(`/api/v1/admin/events/${event.id}/takedown`).set(authHeader(admin)).send({ reason: "Reported by a customer" });
    const takedown = await prisma.auditLog.findFirstOrThrow({ where: { action: "event.takedown" } });
    expect(takedown.metadata).toMatchObject({ reason: "Reported by a customer" });

    await api().post(`/api/v1/events/${event.id}/cancel`).set(authHeader(sellerUser));
    const cancel = await prisma.auditLog.findFirstOrThrow({ where: { action: "event.cancel" } });
    expect(cancel.actorRole).toBe("SELLER");
  });

  it("says that payout details changed, but never records the details", async () => {
    const seller = await createSeller();
    await prisma.user.update({ where: { id: seller.user.id }, data: { passwordHash: await hashPassword("Passw0rdTest") } });

    const res = await api()
      .patch("/api/v1/finance/payout-details")
      .set(authHeader(seller.user))
      .send({ method: "MPESA", details: "0712 345 678", password: "Passw0rdTest" });
    expect(res.status).toBe(200);

    const row = await prisma.auditLog.findFirstOrThrow({ where: { action: "seller.payout_details" } });
    expect(JSON.stringify(row)).not.toContain("254712345678");
    expect(JSON.stringify(row)).not.toContain("0712");
  });

  it("is closed to everyone but admins", async () => {
    const seller = await createSeller();
    const buyer = await createUser("USER");

    expect((await api().get("/api/v1/system/audit")).status).toBe(401);
    expect((await api().get("/api/v1/system/audit").set(authHeader(buyer))).status).toBe(403);
    expect((await api().get("/api/v1/system/audit").set(authHeader(seller.user))).status).toBe(403);
  });
});

describe("system health", () => {
  it("shows the database, jobs, email queue and services to admins only", async () => {
    const admin = await createUser("ADMIN");
    const buyer = await createUser("USER");

    expect((await api().get("/api/v1/system/health")).status).toBe(401);
    expect((await api().get("/api/v1/system/health").set(authHeader(buyer))).status).toBe(403);

    const res = await api().get("/api/v1/system/health").set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.data.database.ok).toBe(true);
    expect(typeof res.body.data.database.latencyMs).toBe("number");
    expect(Array.isArray(res.body.data.jobs)).toBe(true);
    expect(res.body.data.email).toMatchObject({ pending: 0, failed7d: 0 });
    expect(res.body.data.services).toMatchObject({ email: false, monitoring: false });
  });
});

describe("crash reports from browsers", () => {
  it("accepts a small, valid report and refuses nonsense or huge ones", async () => {
    const good = await api().post("/api/v1/system/client-error").send({ kind: "render", message: "x is undefined", url: "/events" });
    expect(good.status).toBe(202);

    expect((await api().post("/api/v1/system/client-error").send({ kind: "boom", message: "x" })).status).toBe(400);
    expect((await api().post("/api/v1/system/client-error").send({ kind: "error", message: "y".repeat(501) })).status).toBe(400);
    expect((await api().post("/api/v1/system/client-error").send({})).status).toBe(400);
  });
});

describe("receipts", () => {
  it("itemises a paid order for its buyer, and for nobody else", async () => {
    const { buyer, order, event } = await setupPaidOrder({ quantity: 2, priceCents: 100_000 });
    const stranger = await createUser("USER");

    const res = await api().get(`/api/v1/receipts/${order.id}`).set(authHeader(buyer));
    expect(res.status).toBe(200);

    const r = res.body.data;
    expect(r.reference).toBe(order.reference);
    expect(r.totalCents).toBe(200_000);
    expect(r.buyer.email).toBe(buyer.email);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({ quantity: 2, unitPriceCents: 100_000, subtotalCents: 200_000, eventTitle: event.title });
    expect(r.lines[0].organizer).toBeTruthy();
    expect(r.payments).toHaveLength(1);

    expect((await api().get(`/api/v1/receipts/${order.id}`).set(authHeader(stranger))).status).toBe(404);
    expect((await api().get(`/api/v1/receipts/${order.id}`)).status).toBe(401);
  });

  it("is not available until the order is paid", async () => {
    const seller = await createSeller();
    const { ticket } = await createEventWithTicket({ sellerProfileId: seller.profile.id, priceCents: 100_000 });
    const buyer = await createUser("USER");
    const unpaid = (await placeOrder(buyer, [{ ticketTypeId: ticket.id, quantity: 1 }])).body.data;

    const res = await api().get(`/api/v1/receipts/${unpaid.id}`).set(authHeader(buyer));
    expect(res.status).toBe(400);
  });

  it("is still there after a refund, marked as refunded", async () => {
    const admin = await createUser("ADMIN");
    const { buyer, order } = await setupPaidOrder();

    await api().post(`/api/v1/admin/orders/${order.id}/refund`).set(authHeader(admin)).send({});

    const res = await api().get(`/api/v1/receipts/${order.id}`).set(authHeader(buyer));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("REFUNDED");
  });
});
// ==========================================
// END OF FILE: backend/tests/reliability.test.ts
// ==========================================