// ==========================================
// FILE: backend/tests/sellers.test.ts
// PURPOSE: Becoming a seller, and a seller reading their own event.
// ==========================================
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/config/database";
import { api, authHeader, createEventWithTicket, createSeller, createUser, inDays, resetDb } from "./helpers";

beforeEach(resetDb);

const application = { businessName: "Jazz Co", businessEmail: "Hello@Jazz.co" };

describe("becoming a seller", () => {
  it("creates a pending profile, promotes the user, and rejects a second application", async () => {
    const user = await createUser("USER");

    const res = await api().post("/api/v1/sellers/onboard").set(authHeader(user)).send(application);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("PENDING");
    expect(res.body.data.businessEmail).toBe("hello@jazz.co");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe("SELLER");

    expect((await api().post("/api/v1/sellers/onboard").set(authHeader(user)).send(application)).status).toBe(409);

    const me = await api().get("/api/v1/sellers/me").set(authHeader(user));
    expect(me.body.data.status).toBe("PENDING");
  });

  it("keeps an admin an admin", async () => {
    const admin = await createUser("ADMIN");

    const res = await api().post("/api/v1/sellers/onboard").set(authHeader(admin)).send(application);
    expect(res.status).toBe(201);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).role).toBe("ADMIN");
  });

  it("cannot create events until an admin approves", async () => {
    const user = await createUser("USER");
    await api().post("/api/v1/sellers/onboard").set(authHeader(user)).send(application);

    const res = await api()
      .post("/api/v1/events")
      .set(authHeader(user))
      .send({
        title: "Not yet approved",
        description: "This should be refused for now.",
        venue: "Somewhere",
        city: "Nairobi",
        country: "Kenya",
        startsAt: inDays(7).toISOString(),
        endsAt: inDays(7, 3).toISOString(),
      });

    expect(res.status).toBe(403);
  });

  it("requires an email and a business name", async () => {
    const user = await createUser("USER");
    const res = await api().post("/api/v1/sellers/onboard").set(authHeader(user)).send({ businessName: "X" });
    expect(res.status).toBe(400);
  });
});

describe("reading an event as its seller", () => {
  it("returns the full event, drafts included, with every ticket field", async () => {
    const seller = await createSeller();
    const { event } = await createEventWithTicket({ sellerProfileId: seller.profile.id, eventStatus: "DRAFT" });

    const res = await api().get(`/api/v1/sellers/events/${event.id}`).set(authHeader(seller.user));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("DRAFT");
    expect(res.body.data.description).toBeTruthy();
    expect(res.body.data.ticketTypes).toHaveLength(1);
    expect(res.body.data.ticketTypes[0]).toHaveProperty("sold");
    expect(res.body.data.ticketTypes[0]).toHaveProperty("minGroupSize");
    expect(res.body.data.ticketTypes[0]).toHaveProperty("startsAt");
  });

  it("is closed to other sellers and buyers, and 404s for unknown events", async () => {
    const owner = await createSeller();
    const rival = await createSeller();
    const buyer = await createUser("USER");
    const { event } = await createEventWithTicket({ sellerProfileId: owner.profile.id });

    expect((await api().get(`/api/v1/sellers/events/${event.id}`).set(authHeader(rival.user))).status).toBe(403);
    expect((await api().get(`/api/v1/sellers/events/${event.id}`).set(authHeader(buyer))).status).toBe(403);
    expect((await api().get("/api/v1/sellers/events/does-not-exist").set(authHeader(owner.user))).status).toBe(404);
  });
});
// ==========================================
// END OF FILE: backend/tests/sellers.test.ts
// ==========================================