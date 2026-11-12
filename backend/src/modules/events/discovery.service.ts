// ==========================================
// FILE: backend/src/modules/events/discovery.service.ts
// PURPOSE: Searching and filtering the public list of events, and finding related, trending and recently viewed ones.
// ==========================================
import { EventStatus, Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { SearchEventsQuery } from "./discovery.schema";

const NAIROBI_OFFSET = "+03:00"; // Nairobi has no daylight saving
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SEARCH_WORDS = 5;

// Events people can still see and open. Sold-out events stay visible so buyers know they existed (and can join a waitlist later).
const VISIBLE: EventStatus[] = ["PUBLISHED", "SOLD_OUT"];

// Only tickets that are on sale, cheapest first.
const activeTickets = {
  where: { isActive: true },
  orderBy: { priceCents: "asc" },
} satisfies Prisma.Event$ticketTypesArgs;

const liveNow = () => ({ status: { in: VISIBLE }, endsAt: { gte: new Date() } });

function orderFor(sort: SearchEventsQuery["sort"]): Prisma.EventOrderByWithRelationInput[] {
  switch (sort) {
    case "newest":
      return [{ createdAt: "desc" }, { id: "asc" }];
    case "popular":
      return [{ tickets: { _count: "desc" } }, { startsAt: "asc" }, { id: "asc" }];
    default:
      return [{ startsAt: "asc" }, { id: "asc" }];
  }
}

export async function searchEvents(query: SearchEventsQuery) {
  const { page, limit } = query;
  const and: Prisma.EventWhereInput[] = [];

  // Every word has to match somewhere: title, description, venue, city or the organizer's name.
  if (query.q) {
    for (const word of query.q.split(/\s+/).filter(Boolean).slice(0, MAX_SEARCH_WORDS)) {
      and.push({
        OR: [
          { title: { contains: word, mode: "insensitive" } },
          { description: { contains: word, mode: "insensitive" } },
          { venue: { contains: word, mode: "insensitive" } },
          { city: { contains: word, mode: "insensitive" } },
          { seller: { businessName: { contains: word, mode: "insensitive" } } },
        ],
      });
    }
  }

  if (query.city) and.push({ city: { equals: query.city, mode: "insensitive" } });
  if (query.country) and.push({ country: { equals: query.country, mode: "insensitive" } });
  if (query.category) and.push({ category: query.category });
  if (query.sellerId) and.push({ sellerId: query.sellerId });

  if (query.from || query.to) {
    and.push({
      startsAt: {
        ...(query.from && { gte: new Date(`${query.from}T00:00:00.000${NAIROBI_OFFSET}`) }),
        ...(query.to && { lte: new Date(`${query.to}T23:59:59.999${NAIROBI_OFFSET}`) }),
      },
    });
  }

  if (query.free === "true") {
    and.push({ ticketTypes: { some: { isActive: true, priceCents: 0 } } });
  }
  if (query.maxPriceCents !== undefined) {
    and.push({ ticketTypes: { some: { isActive: true, priceCents: { lte: query.maxPriceCents } } } });
  }

  const where: Prisma.EventWhereInput = { ...liveNow(), AND: and };

  const [items, total] = await prisma.$transaction([
    prisma.event.findMany({
      where,
      include: { ticketTypes: activeTickets },
      orderBy: orderFor(query.sort),
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.event.count({ where }),
  ]);

  return { items, total, page, limit };
}

interface Counted {
  name: string;
  count: number;
}

// "Nairobi" and "nairobi" are one place. The most common spelling is the one shown.
function mergeNames(rows: Counted[]): Counted[] {
  const byKey = new Map<string, Counted>();
  for (const row of [...rows].sort((a, b) => b.count - a.count)) {
    const key = row.name.trim().toLowerCase();
    const existing = byKey.get(key);
    if (existing) existing.count += row.count;
    else byKey.set(key, { name: row.name.trim(), count: row.count });
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// The cities, countries and categories that have live events, for the filter menus.
export async function getFilterOptions() {
  const where: Prisma.EventWhereInput = liveNow();

  const [cities, countries, categories] = await Promise.all([
    prisma.event.groupBy({ by: ["city"], where, _count: { _all: true } }),
    prisma.event.groupBy({ by: ["country"], where, _count: { _all: true } }),
    prisma.event.groupBy({ by: ["category"], where, _count: { _all: true } }),
  ]);

  return {
    cities: mergeNames(cities.map((c) => ({ name: c.city, count: c._count._all }))),
    countries: mergeNames(countries.map((c) => ({ name: c.country, count: c._count._all }))),
    categories: categories.map((c) => ({ value: c.category, count: c._count._all })),
  };
}

// One event page. Includes the organiser's name, and nothing private about them.
export async function getEventDetail(slug: string) {
  const event = await prisma.event.findFirst({
    where: { slug, status: { in: VISIBLE } },
    include: { ticketTypes: activeTickets, seller: { select: { id: true, businessName: true } } },
  });
  if (!event) throw ApiError.notFound("Event not found");
  return event;
}

// Up to 4 live events like this one: same category, same city, or the same organiser, best matches first.
export async function similarEvents(slug: string) {
  const base = await prisma.event.findFirst({
    where: { slug, status: { in: VISIBLE } },
    select: { id: true, category: true, city: true, sellerId: true },
  });
  if (!base) throw ApiError.notFound("Event not found");

  const related: Prisma.EventWhereInput[] = [{ city: { equals: base.city, mode: "insensitive" } }, { sellerId: base.sellerId }];
  if (base.category !== "OTHER") related.push({ category: base.category }); // "Other" says nothing about what it is

  const candidates = await prisma.event.findMany({
    where: { ...liveNow(), id: { not: base.id }, OR: related },
    include: { ticketTypes: activeTickets },
    orderBy: { startsAt: "asc" },
    take: 24,
  });

  const score = (e: (typeof candidates)[number]) =>
    (base.category !== "OTHER" && e.category === base.category ? 2 : 0) +
    (e.city.toLowerCase() === base.city.toLowerCase() ? 1 : 0) +
    (e.sellerId === base.sellerId ? 1 : 0);

  return candidates
    .map((event) => ({ event, score: score(event) }))
    .sort((a, b) => b.score - a.score || a.event.startsAt.getTime() - b.event.startsAt.getTime())
    .slice(0, 8)
    .slice(0, 4)
    .map((x) => x.event);
}

// The live events that sold the most tickets in the last 7 days.
export async function trendingEvents() {
  const rows = await prisma.ticket.groupBy({
    by: ["eventId"],
    where: { createdAt: { gte: new Date(Date.now() - 7 * DAY_MS) }, status: { not: "VOID" }, event: liveNow() },
    _count: { _all: true },
    orderBy: { _count: { eventId: "desc" } },
    take: 8,
  });
  if (rows.length === 0) return [];

  const events = await prisma.event.findMany({
    where: { id: { in: rows.map((r) => r.eventId) }, ...liveNow() },
    include: { ticketTypes: activeTickets },
  });

  const byId = new Map(events.map((e) => [e.id, e]));
  return rows.map((r) => byId.get(r.eventId)).filter((e): e is NonNullable<typeof e> => e !== undefined);
}

// Looks up a handful of events by their links, in the order asked. Events that are gone are left out.
export async function lookupEvents(slugs: string[]) {
  if (slugs.length === 0) return [];

  const events = await prisma.event.findMany({
    where: { slug: { in: slugs }, ...liveNow() },
    include: { ticketTypes: activeTickets },
  });

  const bySlug = new Map(events.map((e) => [e.slug, e]));
  return slugs.map((s) => bySlug.get(s)).filter((e): e is NonNullable<typeof e> => e !== undefined);
}
// ==========================================
// END OF FILE: backend/src/modules/events/discovery.service.ts
// ==========================================