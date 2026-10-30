// ==========================================
// FILE: backend/tests/categories-and-duplicates.test.ts
// PURPOSE: Event categories, the category filter, and duplicating an event.
// ==========================================
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/config/database";
import { api, authHeader, createEventWithTicket, createSeller, createUser, inDays, resetDb } from "./helpers";

beforeEach(resetDb);

const DAY = 24 * 60 * 60 * 1000;

const eventBody = (extra: object = {}) => ({
  title: "Category Test Night",
  description: "An event used to test categories.",
  venue: "KICC",
  city: "Nairobi",
  country: "Kenya",
  startsAt: inDays(7).toISOString(),
  endsAt: inDays(7, 3).toISOString(),
  ...extra,
});

describe("event categories", () => {
  it("defaults to OTHER, keeps a chosen category, can change it, and rejects unknown ones", async () => {
    const seller = await createSeller();
    const post = (extra: object = {}) => api().post("/api/v1/events").set(authHeader(seller.user)).send(eventBody(extra));

    const plain = await post();
    expect(plain.status).toBe(201);
    expect(plain.body.data.category).toBe("OTHER");

    const music = await post({ category: "MUSIC" });
    expect(music.body.data.category).toBe("MUSIC");

    const changed = await api()
      .patch(`/api/v1/events/${music.body.data.id}`)
      .set(authHeader(seller.user))
      .send({ category: "SPORTS" });
    expect(changed.status).toBe(200);
    expect(changed.body.data.category).toBe("SPORTS");

    expect((await post({ category: "BEER" })).status).toBe(400);
  });

  it("filters the public list by category and reports which categories have live events", async () => {
    const seller = await createSeller();
    const a = await createEventWithTicket({ sellerProfileId: seller.profile.id });
    const b = await createEventWithTicket({ sellerProfileId: seller.profile.id });
    const c = await createEventWithTicket({ sellerProfileId: seller.profile.id, eventStatus: "DRAFT" });
    await prisma.event.update({ where: { id: a.event.id }, data: { category: "SPORTS" } });
    await prisma.event.update({ where: { id: b.event.id }, data: { category: "MUSIC" } });
    await prisma.event.update({ where: { id: c.event.id }, data: { category: "FOOD" } }); // a draft, so it must not count

    const sports = await api().get("/api/v1/events?category=SPORTS");
    expect(sports.status).toBe(200);
    expect(sports.body.data).toHaveLength(1);
    expect(sports.body.data[0].category).toBe("SPORTS");

    const options = await api().get("/api/v1/events/filters");
    expect(options.body.data.categories).toEqual(
      expect.arrayContaining([
        { value: "SPORTS", count: 1 },
        { value: "MUSIC", count: 1 },
      ])
    );
    expect(options.body.data.categories.some((x: { value: string }) => x.value === "FOOD")).toBe(false);

    expect((await api().get("/api/v1/events?category=BEER")).status).toBe(400);
  });
});

describe("duplicating an event", () => {
  async function setup() {
    const seller = await createSeller();
    const { event, ticket } = await createEventWithTicket({ sellerProfileId: seller.profile.id, quantity: 20 });
    await prisma.ticketType.update({ where: { id: ticket.id }, data: { sold: 3 } });
    const early = await prisma.ticketType.create({
      data: {
        eventId: event.id,
        name: "Early",
        tier: "EARLY_BIRD",
        priceCents: 50_000,
        currency: "KES",
        quantity: 10,
        startsAt: inDays(-1),
        endsAt: inDays(1),
      },
    });
    await prisma.event.update({ where: { id: event.id }, data: { category: "MUSIC" } });
    return { seller, event, ticket, early };
  }

  const dates = (event: { startsAt: Date; endsAt: Date }, days = 14) => ({
    startsAt: new Date(event.startsAt.getTime() + days * DAY).toISOString(),
    endsAt: new Date(event.endsAt.getTime() + days * DAY).toISOString(),
  });

  it("copies the event and its tickets as a fresh draft, and leaves the original alone", async () => {
    const { seller, event, early } = await setup();

    const res = await api().post(`/api/v1/events/${event.id}/duplicate`).set(authHeader(seller.user)).send(dates(event));
    expect(res.status).toBe(201);

    const copy = res.body.data;
    expect(copy.status).toBe("DRAFT");
    expect(copy.slug).not.toBe(event.slug);
    expect(copy.title).toBe(event.title);
    expect(copy.category).toBe("MUSIC");
    expect(copy.ticketTypes).toHaveLength(2);
    expect(copy.ticketTypes.every((t: { sold: number }) => t.sold === 0)).toBe(true);

    // The early bird window moved by the same 14 days as the event.
    const copiedEarly = copy.ticketTypes.find((t: { name: string }) => t.name === "Early");
    const moved = new Date(copiedEarly.startsAt).getTime() - early.startsAt!.getTime();
    expect(Math.abs(moved - 14 * DAY)).toBeLessThan(1000);

    // The copy is hidden until it is reviewed, and the original is untouched.
    expect((await api().get(`/api/v1/events/${copy.slug}`)).status).toBe(404);
    const original = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(original.status).toBe("PUBLISHED");
    expect((await prisma.ticketType.findMany({ where: { eventId: event.id, name: "General" } }))[0].sold).toBe(3);
  });

  it("needs sensible new dates", async () => {
    const { seller, event } = await setup();
    const post = (body: object) => api().post(`/api/v1/events/${event.id}/duplicate`).set(authHeader(seller.user)).send(body);

    expect((await post({ startsAt: inDays(-3).toISOString(), endsAt: inDays(-2).toISOString() })).status).toBe(400);
    expect((await post({ startsAt: inDays(20).toISOString(), endsAt: inDays(19).toISOString() })).status).toBe(400);
    expect((await post({ startsAt: "tomorrow" })).status).toBe(400);
  });

  it("is only for the event's own seller", async () => {
    const { event } = await setup();
    const rival = await createSeller();
    const buyer = await createUser("USER");

    expect((await api().post(`/api/v1/events/${event.id}/duplicate`).set(authHeader(rival.user)).send(dates(event))).status).toBe(403);
    expect((await api().post(`/api/v1/events/${event.id}/duplicate`).set(authHeader(buyer)).send(dates(event))).status).toBe(403);
  });
});
// ==========================================
// END OF FILE: backend/tests/categories-and-duplicates.test.ts
// ==========================================