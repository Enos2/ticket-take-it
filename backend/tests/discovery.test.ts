// ==========================================
// FILE: backend/tests/discovery.test.ts
// PURPOSE: Searching, filtering and sorting the public events list.
// ==========================================
import { randomBytes } from "crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { EventStatus } from "@prisma/client";
import type { Response } from "supertest";
import { prisma } from "../src/config/database";
import { api, createSeller, inDays, resetDb } from "./helpers";

beforeEach(resetDb);

const DAY = 24 * 60 * 60 * 1000;
const pause = () => new Promise((resolve) => setTimeout(resolve, 20));
const day = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

interface Spec {
  title: string;
  city?: string;
  country?: string;
  venue?: string;
  startsInDays?: number;
  priceCents?: number;
  status?: EventStatus;
}

async function makeEvent(sellerId: string, spec: Spec) {
  const start = spec.startsInDays ?? 10;
  return await prisma.event.create({
    data: {
      sellerId,
      title: spec.title,
      slug: `t-${randomBytes(4).toString("hex")}`,
      description: "A test event for search.",
      venue: spec.venue ?? "Test Venue",
      city: spec.city ?? "Nairobi",
      country: spec.country ?? "Kenya",
      startsAt: inDays(start),
      endsAt: inDays(start, 3),
      status: spec.status ?? "PUBLISHED",
      ticketTypes: { create: [{ name: "General", priceCents: spec.priceCents ?? 100_000, currency: "KES", quantity: 50 }] },
    },
  });
}

const search = (qs = "") => api().get(`/api/v1/events${qs ? `?${qs}` : ""}`);
const titles = (res: Response): string[] => res.body.data.map((e: { title: string }) => e.title);

describe("what the public list shows", () => {
  it("only shows live events that haven't ended", async () => {
    const { profile } = await createSeller();
    await makeEvent(profile.id, { title: "Live One" });
    await makeEvent(profile.id, { title: "A Draft", status: "DRAFT" });
    await makeEvent(profile.id, { title: "In Review", status: "PENDING_REVIEW" });
    await makeEvent(profile.id, { title: "Rejected", status: "REJECTED" });
    await makeEvent(profile.id, { title: "Paused", status: "TAKEN_DOWN" });
    await makeEvent(profile.id, { title: "Cancelled", status: "CANCELLED" });
    await makeEvent(profile.id, { title: "Long Gone", startsInDays: -5 });

    const res = await search();
    expect(res.status).toBe(200);
    expect(titles(res)).toEqual(["Live One"]);
  });
});

describe("searching", () => {
  it("matches words in the title, venue, city and organizer name, in any case", async () => {
    const { profile } = await createSeller();
    await makeEvent(profile.id, { title: "Nairobi Jazz Night", venue: "Garden Courtyard" });
    await makeEvent(profile.id, { title: "Rock Festival", city: "Mombasa" });

    expect(titles(await search("q=jAzZ"))).toEqual(["Nairobi Jazz Night"]);
    expect(titles(await search("q=courtyard"))).toEqual(["Nairobi Jazz Night"]);
    expect(titles(await search("q=mombasa"))).toEqual(["Rock Festival"]);
    expect(titles(await search(`q=${encodeURIComponent(profile.businessName)}`)).sort()).toEqual(["Nairobi Jazz Night", "Rock Festival"]);
  });

  it("needs every word to match, and returns nothing for a word nobody uses", async () => {
    const { profile } = await createSeller();
    await makeEvent(profile.id, { title: "Nairobi Jazz Night" });
    await makeEvent(profile.id, { title: "Mombasa Jazz Brunch", city: "Mombasa" });

    expect(titles(await search("q=jazz nairobi"))).toEqual(["Nairobi Jazz Night"]);
    expect((await search("q=zzzzzz")).body.data).toHaveLength(0);
  });
});

describe("filtering", () => {
  it("filters by city and country without caring about capital letters", async () => {
    const { profile } = await createSeller();
    await makeEvent(profile.id, { title: "In Nairobi" });
    await makeEvent(profile.id, { title: "In Mombasa", city: "Mombasa" });
    await makeEvent(profile.id, { title: "In Kampala", city: "Kampala", country: "Uganda" });

    expect(titles(await search("city=nairobi"))).toEqual(["In Nairobi"]);
    expect(titles(await search("country=UGANDA"))).toEqual(["In Kampala"]);
  });

  it("filters free events and a maximum price", async () => {
    const { profile } = await createSeller();
    await makeEvent(profile.id, { title: "Free Run", priceCents: 0 });
    await makeEvent(profile.id, { title: "Cheap Show", priceCents: 50_000 });
    await makeEvent(profile.id, { title: "Pricey Gala", priceCents: 500_000 });

    expect(titles(await search("free=true"))).toEqual(["Free Run"]);
    expect(titles(await search("maxPriceCents=60000")).sort()).toEqual(["Cheap Show", "Free Run"]);
  });

  it("filters by a date range", async () => {
    const { profile } = await createSeller();
    await makeEvent(profile.id, { title: "Soon", startsInDays: 5 });
    await makeEvent(profile.id, { title: "Later", startsInDays: 20 });

    expect(titles(await search(`from=${day(3)}&to=${day(10)}`))).toEqual(["Soon"]);
    expect(titles(await search(`from=${day(15)}`))).toEqual(["Later"]);
  });

  it("rejects bad dates, backwards ranges and oversized pages", async () => {
    expect((await search("from=10-10-2026")).status).toBe(400);
    expect((await search(`from=${day(10)}&to=${day(3)}`)).status).toBe(400);
    expect((await search("limit=100")).status).toBe(400);
    expect((await search("sort=cheapest")).status).toBe(400);
  });
});

describe("sorting and paging", () => {
  it("sorts by soonest or newest", async () => {
    const { profile } = await createSeller();
    await makeEvent(profile.id, { title: "First Created, Soon", startsInDays: 5 });
    await pause();
    await makeEvent(profile.id, { title: "Second Created, Later", startsInDays: 20 });

    expect(titles(await search("sort=soonest"))).toEqual(["First Created, Soon", "Second Created, Later"]);
    expect(titles(await search("sort=newest"))).toEqual(["Second Created, Later", "First Created, Soon"]);
    expect((await search("sort=popular")).status).toBe(200);
  });

  it("pages through results", async () => {
    const { profile } = await createSeller();
    for (const title of ["One", "Two", "Three"]) await makeEvent(profile.id, { title });

    const second = await search("limit=2&page=2");
    expect(second.body.data).toHaveLength(1);
    expect(second.body.meta).toEqual({ total: 3, page: 2, limit: 2 });
  });
});

describe("filter options", () => {
  it("lists the places that have live events, merging different capital letters", async () => {
    const { profile } = await createSeller();
    await makeEvent(profile.id, { title: "A" });
    await makeEvent(profile.id, { title: "B" });
    await makeEvent(profile.id, { title: "C", city: "nairobi" });
    await makeEvent(profile.id, { title: "D", city: "Mombasa" });
    await makeEvent(profile.id, { title: "Hidden", city: "Kisumu", status: "DRAFT" });

    const res = await api().get("/api/v1/events/filters");
    expect(res.status).toBe(200);
    expect(res.body.data.cities).toEqual([
      { name: "Mombasa", count: 1 },
      { name: "Nairobi", count: 3 },
    ]);
    expect(res.body.data.countries).toEqual([{ name: "Kenya", count: 4 }]);
  });
});
// ==========================================
// END OF FILE: backend/tests/discovery.test.ts
// ==========================================