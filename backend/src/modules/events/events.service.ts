// ==========================================
// FILE: backend/src/modules/events/events.service.ts
// PURPOSE: Business logic for creating and fetching events.
// ==========================================
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { CreateEventInput } from "./events.schema";

// Helper to generate a URL-friendly slug
const generateSlug = (title: string) => 
  title.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now().toString().slice(-4);

export async function createEvent(userId: string, input: CreateEventInput) {
  const seller = await prisma.sellerProfile.findUnique({ where: { userId } });
  if (!seller) throw ApiError.forbidden("You must be a seller to create events");

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
      status: "PUBLISHED", // Auto-publish for testing
    },
  });
}

export async function getAllEvents() {
  return await prisma.event.findMany({
    where: { status: "PUBLISHED" },
    include: {
      ticketTypes: true, // Include tickets so users can see prices
    },
    orderBy: { startsAt: "asc" },
  });
}
// ==========================================
// END OF FILE: backend/src/modules/events/events.service.ts
// LOCATION: backend/src/modules/events/events.service.ts
// LAST UPDATED: October 19, 2026
// ==========================================