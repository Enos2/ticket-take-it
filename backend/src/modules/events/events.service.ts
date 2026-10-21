// ==========================================
// FILE: backend/src/modules/events/events.service.ts
// PURPOSE: Business logic for creating and fetching events.
// ==========================================
import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { CreateEventInput, ListEventsQuery } from "./events.schema";

// URL-friendly slug with a random suffix to avoid collisions.
function generateSlug(title: string): string {
  const base =
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "event";

  return `${base}-${randomBytes(3).toString("hex")}`;
}

const MAX_SLUG_ATTEMPTS = 3;

// Only tickets that are on sale, cheapest first.
const activeTickets = {
  where: { isActive: true },
  orderBy: { priceCents: "asc" },
} satisfies Prisma.Event$ticketTypesArgs;

export async function createEvent(userId: string, input: CreateEventInput) {
  const seller = await prisma.sellerProfile.findUnique({ where: { userId } });
  if (!seller) throw ApiError.forbidden("You must be a seller to create events");
  if (seller.status !== "APPROVED") {
    throw ApiError.forbidden("Your seller account has not been approved yet");
  }

  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    try {
      return await prisma.event.create({
        data: {
          sellerId: seller.id,
          title: input.title,
          slug: generateSlug(input.title),
          description: input.description,
          venue: input.venue,
          city: input.city,
          country: input.country,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          status: "PUBLISHED", // Auto-publish for testing. Add a draft/publish step before launch.
        },
      });
    } catch (err) {
      const isSlugCollision =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (!isSlugCollision || attempt === MAX_SLUG_ATTEMPTS) throw err;
    }
  }

  // Unreachable, keeps TypeScript satisfied.
  throw ApiError.badRequest("Could not create event");
}

export async function getAllEvents({ page, limit }: ListEventsQuery) {
  const where: Prisma.EventWhereInput = {
    status: "PUBLISHED",
    endsAt: { gte: new Date() }, // hide events that have already ended
  };

  const [items, total] = await prisma.$transaction([
    prisma.event.findMany({
      where,
      include: { ticketTypes: activeTickets }, // so users can see prices
      orderBy: { startsAt: "asc" },
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.event.count({ where }),
  ]);

  return { items, total, page, limit };
}

export async function getEventBySlug(slug: string) {
  const event = await prisma.event.findFirst({
    where: { slug, status: "PUBLISHED" },
    include: { ticketTypes: activeTickets },
  });
  if (!event) throw ApiError.notFound("Event not found");
  return event;
}
// ==========================================
// END OF FILE: backend/src/modules/events/events.service.ts
// ==========================================