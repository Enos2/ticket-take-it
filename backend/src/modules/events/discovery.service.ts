// ==========================================
// FILE: backend/src/modules/events/discovery.service.ts
// PURPOSE: Searching and filtering the public list of events.
// ==========================================
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { SearchEventsQuery } from "./discovery.schema";

const NAIROBI_OFFSET = "+03:00"; // Nairobi has no daylight saving

// Only tickets that are on sale, cheapest first.
const activeTickets = {
  where: { isActive: true },
  orderBy: { priceCents: "asc" },
} satisfies Prisma.Event$ticketTypesArgs;

const MAX_SEARCH_WORDS = 5;

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
  if (query.country) and.push({ country: { equals: query.country, mode: "insensitive" } }); if (query.category) and.push({ category: query.category });

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

  const where: Prisma.EventWhereInput = {
    status: "PUBLISHED",
    endsAt: { gte: new Date() }, // hide events that have already ended
    AND: and,
  };

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

// The cities and countries that have live events, for the filter dropdowns.
export async function getFilterOptions() {
  const where: Prisma.EventWhereInput = { status: "PUBLISHED", endsAt: { gte: new Date() } };

  const [cities, countries, categories] = await Promise.all([
    prisma.event.groupBy({ by: ["city"], where, _count: { _all: true } }),
    prisma.event.groupBy({ by: ["country"], where, _count: { _all: true } }), prisma.event.groupBy({ by: ["category"], where, _count: { _all: true } }),
  ]);

  return {
    cities: mergeNames(cities.map((c) => ({ name: c.city, count: c._count._all }))),
    countries: mergeNames(countries.map((c) => ({ name: c.country, count: c._count._all }))), categories: categories.map((c) => ({ value: c.category, count: c._count._all })),
  };
}
// ==========================================
// END OF FILE: backend/src/modules/events/discovery.service.ts
// ==========================================