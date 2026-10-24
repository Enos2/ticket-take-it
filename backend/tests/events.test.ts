// ==========================================
// FILE: backend/tests/events.test.ts
// PURPOSE: Event and ticket type management: who may do what, and the rules that protect buyers.
// ==========================================
import { beforeEach, describe, expect, it } from "vitest";
import { api, authHeader, createSeller, createUser, inDays, resetDb, setupPaidOrder } from "./helpers";

beforeEach(resetDb);

const eventBody = () => ({
  title: "Nairobi Jazz Night",
  description: "An evening of live jazz music.",
  venue: "KICC",
  city: "Nairobi",
  country: "Kenya",
  startsAt: inDays(7).toISOString(),
  endsAt: inDays(7, 3).toISOString(),
});

const ticketBody = (overrides: object = {}) => ({
  name: "General",
  tier: "REGULAR",
  priceCents: 50_000,
  quantity: 20,
  ...overrides,
});

describe("creating events", () => {
  it("lets an approved seller create a draft, but not a pending seller or a buyer", async () => {
    const approved = await createSeller("APPROVED");
    const pending = await createSeller("PENDING");
    const buyer = await createUser("USER");

    const ok = await api().post("/api/v1/events").set(authHeader(approved.user)).send(eventBody());
    expect(ok.status).toBe(201);
    expect(ok.body.data.status).toBe("DRAFT");

    expect((await api().post("/api/v1/events").set(authHeader(pending.user)).send(eventBody())).status).toBe(403);
    expect((await api().post("/api/v1/events").set(authHeader(buyer)).send(eventBody())).status).toBe(403);
  });

  it("rejects an event that ends before it starts", async () => {
    const seller = await createSeller();
    const res = await api()
      .post("/api/v1/events")
      .set(authHeader(seller.user))
      .send({ ...eventBody(), endsAt: inDays(1).toISOString() });
    expect(res.status).toBe(400);
  });
});

describe("publishing", () => {
  it("needs at least one ticket type, then shows the event publicly", async () => {
    const seller = await createSeller();
    const created = await api().post("/api/v1/events").set(authHeader(seller.user)).send(eventBody());
    const eventId = created.body.data.id as string;
    const slug = created.body.data.slug as string;

    expect((await api().post(`/api/v1/events/${eventId}/publish`).set(authHeader(seller.user))).status).toBe(400);
    expect((await api().get(`/api/v1/events/${slug}`)).status).toBe(404); // drafts are invisible

    const ticket = await api().post(`/api/v1/events/${eventId}/tickets`).set(authHeader(seller.user)).send(ticketBody());
    expect(ticket.status).toBe(201);
    expect(ticket.body.data.currency).toBe("KES");

    const published = await api().post(`/api/v1/events/${eventId}/publish`).set(authHeader(seller.user));
    expect(published.status).toBe(200);
    expect(published.body.data.status).toBe("PUBLISHED");

    expect((await api().get(`/api/v1/events/${slug}`)).status).toBe(200);
    const list = await api().get("/api/v1/events");
    expect(list.body.data.map((e: { slug: string }) => e.slug)).toContain(slug);
  });

  it("stops other sellers from editing or publishing someone else's event", async () => {
    const owner = await createSeller();
    const rival = await createSeller();
    const created = await api().post("/api/v1/events").set(authHeader(owner.user)).send(eventBody());
    const eventId = created.body.data.id as string;

    expect((await api().patch(`/api/v1/events/${eventId}`).set(authHeader(rival.user)).send({ title: "Hijacked title" })).status).toBe(403);
    expect((await api().post(`/api/v1/events/${eventId}/publish`).set(authHeader(rival.user))).status).toBe(403);
    expect((await api().post(`/api/v1/events/${eventId}/tickets`).set(authHeader(rival.user)).send(ticketBody())).status).toBe(403);
  });
});

describe("ticket type rules", () => {
  it("rejects KES prices with cents and mixed currencies on one event", async () => {
    const seller = await createSeller();
    const created = await api().post("/api/v1/events").set(authHeader(seller.user)).send(eventBody());
    const eventId = created.body.data.id as string;
    const post = (body: object) => api().post(`/api/v1/events/${eventId}/tickets`).set(authHeader(seller.user)).send(body);

    expect((await post(ticketBody({ priceCents: 50_050 }))).status).toBe(400); // KES 500.50 is not payable by M-Pesa
    expect((await post(ticketBody())).status).toBe(201);
    expect((await post(ticketBody({ name: "Dollar", currency: "USD" }))).status).toBe(400);
  });

  it("requires group sizes for group tickets and a window for early bird tickets", async () => {
    const seller = await createSeller();
    const created = await api().post("/api/v1/events").set(authHeader(seller.user)).send(eventBody());
    const eventId = created.body.data.id as string;
    const post = (body: object) => api().post(`/api/v1/events/${eventId}/tickets`).set(authHeader(seller.user)).send(body);

    expect((await post(ticketBody({ tier: "GROUP" }))).status).toBe(400);
    expect((await post(ticketBody({ tier: "GROUP", minGroupSize: 2, maxGroupSize: 5 }))).status).toBe(201);
    expect((await post(ticketBody({ tier: "EARLY_BIRD" }))).status).toBe(400);
    expect(
      (await post(ticketBody({ tier: "EARLY_BIRD", startsAt: inDays(1).toISOString(), endsAt: inDays(3).toISOString() }))).status
    ).toBe(201);
  });
});

describe("after tickets have been sold", () => {
  it("blocks unpublishing, deleting, and shrinking a ticket type below what was sold", async () => {
    const { sellerUser, event, ticket } = await setupPaidOrder({ quantity: 2, stock: 5 });
    const owner = authHeader(sellerUser);

    expect((await api().post(`/api/v1/events/${event.id}/unpublish`).set(owner)).status).toBe(409);
    expect((await api().delete(`/api/v1/events/${event.id}`).set(owner)).status).toBe(409);
    expect((await api().delete(`/api/v1/events/${event.id}/tickets/${ticket.id}`).set(owner)).status).toBe(409);

    const shrink = await api().patch(`/api/v1/events/${event.id}/tickets/${ticket.id}`).set(owner).send({ quantity: 1 });
    expect(shrink.status).toBe(400);

    const deactivate = await api().patch(`/api/v1/events/${event.id}/tickets/${ticket.id}`).set(owner).send({ isActive: false });
    expect(deactivate.status).toBe(200);
  });

  it("shows sellers their sales and check-in numbers", async () => {
    const { sellerUser, event } = await setupPaidOrder({ quantity: 2, stock: 5, priceCents: 100_000 });

    const res = await api().get(`/api/v1/sellers/events/${event.id}/summary`).set(authHeader(sellerUser));

    expect(res.status).toBe(200);
    expect(res.body.data.totals.ticketsIssued).toBe(2);
    expect(res.body.data.totals.checkedIn).toBe(0);
    expect(res.body.data.totals.revenueCents).toBe(200_000);
  });
});
// ==========================================
// END OF FILE: backend/tests/events.test.ts
// ==========================================