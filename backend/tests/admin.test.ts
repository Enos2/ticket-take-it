// ==========================================
// FILE: backend/tests/admin.test.ts
// PURPOSE: Admin access, platform stats, seller approval, user management and order search.
// ==========================================
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/config/database";
import { api, authHeader, createSeller, createUser, resetDb, setupPaidOrder } from "./helpers";

beforeEach(resetDb);

describe("admin access", () => {
  it("is closed to visitors, buyers and sellers", async () => {
    const buyer = await createUser("USER");
    const seller = await createSeller();

    expect((await api().get("/api/v1/admin/stats")).status).toBe(401);
    expect((await api().get("/api/v1/admin/stats").set(authHeader(buyer))).status).toBe(403);
    expect((await api().get("/api/v1/admin/stats").set(authHeader(seller.user))).status).toBe(403);
  });
});

describe("stats", () => {
  it("counts sales, tickets and revenue, and the work waiting for an admin", async () => {
    const admin = await createUser("ADMIN");
    await setupPaidOrder({ quantity: 2, priceCents: 100_000 });
    await createSeller("PENDING");

    const res = await api().get("/api/v1/admin/stats").set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.data.paidOrders).toBe(1);
    expect(res.body.data.ticketsIssued).toBe(2);
    expect(res.body.data.pendingSellers).toBe(1);
    expect(res.body.data.paymentsNeedingRefund).toBe(0);
    expect(res.body.data.revenue).toEqual([{ currency: "KES", totalCents: 200_000 }]);
  });
});

describe("sellers", () => {
  it("filters by status and never sends payout details", async () => {
    const admin = await createUser("ADMIN");
    await createSeller("PENDING");
    await createSeller("APPROVED");

    const pending = await api().get("/api/v1/admin/sellers?status=PENDING").set(authHeader(admin));
    expect(pending.status).toBe(200);
    expect(pending.body.data).toHaveLength(1);
    expect(pending.body.data[0].status).toBe("PENDING");
    expect(pending.body.data[0].user.email).toBeTruthy();
    expect(pending.body.data[0]).not.toHaveProperty("payoutDetails");

    const all = await api().get("/api/v1/admin/sellers").set(authHeader(admin));
    expect(all.body.meta.total).toBe(2);
  });

  it("approves, suspends and reinstates, and refuses bad requests", async () => {
    const admin = await createUser("ADMIN");
    const { profile } = await createSeller("PENDING");
    const patch = (status: string) =>
      api().patch(`/api/v1/admin/sellers/${profile.id}/status`).set(authHeader(admin)).send({ status });

    const approved = await patch("APPROVED");
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe("APPROVED");
    expect(approved.body.data.approvedAt).not.toBeNull();

    expect((await patch("SUSPENDED")).body.data.status).toBe("SUSPENDED");
    expect((await patch("APPROVED")).body.data.status).toBe("APPROVED");

    expect((await patch("PENDING")).status).toBe(400);
    const unknown = await api().patch("/api/v1/admin/sellers/nope/status").set(authHeader(admin)).send({ status: "APPROVED" });
    expect(unknown.status).toBe(404);
  });
});

describe("users", () => {
  it("disables an account straight away, and re-enables it", async () => {
    const admin = await createUser("ADMIN");
    const target = await createUser("USER");
    await prisma.refreshToken.create({
      data: { token: "some-hash", userId: target.id, expiresAt: new Date(Date.now() + 60_000) },
    });

    expect((await api().get("/api/v1/users/me").set(authHeader(target))).status).toBe(200);

    const off = await api().patch(`/api/v1/admin/users/${target.id}/status`).set(authHeader(admin)).send({ isActive: false });
    expect(off.status).toBe(200);
    expect(off.body.data.isActive).toBe(false);

    // Their token stops working at once, and their sessions are ended.
    expect((await api().get("/api/v1/users/me").set(authHeader(target))).status).toBe(401);
    expect(await prisma.refreshToken.count({ where: { userId: target.id, revokedAt: null } })).toBe(0);

    const on = await api().patch(`/api/v1/admin/users/${target.id}/status`).set(authHeader(admin)).send({ isActive: true });
    expect(on.body.data.isActive).toBe(true);
    expect((await api().get("/api/v1/users/me").set(authHeader(target))).status).toBe(200);
  });

  it("does not let an admin disable their own account", async () => {
    const admin = await createUser("ADMIN");
    const res = await api().patch(`/api/v1/admin/users/${admin.id}/status`).set(authHeader(admin)).send({ isActive: false });
    expect(res.status).toBe(400);
  });

  it("finds people by part of their email", async () => {
    const admin = await createUser("ADMIN");
    const target = await createUser("USER");
    await createUser("USER");

    const handle = target.email.split("@")[0];
    const res = await api().get(`/api/v1/admin/users?q=${encodeURIComponent(handle)}`).set(authHeader(admin));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(target.id);
  });
});

describe("orders", () => {
  it("finds an order by its reference or the buyer's email, and filters by status", async () => {
    const admin = await createUser("ADMIN");
    const { order, buyer } = await setupPaidOrder();

    const byReference = await api().get(`/api/v1/admin/orders?q=${order.reference}`).set(authHeader(admin));
    expect(byReference.body.data).toHaveLength(1);
    expect(byReference.body.data[0].reference).toBe(order.reference);
    expect(byReference.body.data[0].user.email).toBe(buyer.email);

    const byEmail = await api().get(`/api/v1/admin/orders?q=${encodeURIComponent(buyer.email)}`).set(authHeader(admin));
    expect(byEmail.body.data).toHaveLength(1);

    expect((await api().get("/api/v1/admin/orders?status=PAID").set(authHeader(admin))).body.data).toHaveLength(1);
    expect((await api().get("/api/v1/admin/orders?status=REFUNDED").set(authHeader(admin))).body.data).toHaveLength(0);
    expect((await api().get("/api/v1/admin/orders?q=ORD-DOESNOTEXIST").set(authHeader(admin))).body.data).toHaveLength(0);
  });
});
// ==========================================
// END OF FILE: backend/tests/admin.test.ts
// ==========================================