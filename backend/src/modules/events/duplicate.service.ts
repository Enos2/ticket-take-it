// ==========================================
// FILE: backend/src/modules/events/duplicate.service.ts
// PURPOSE: Copies an event and its ticket types to new dates, for recurring events.
// ==========================================
import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { getManagedEvent } from "./event.access";
import { generateSlug } from "./events.service";

const MAX_SLUG_ATTEMPTS = 3;

// The copy is always a draft. Nothing sold, held or reviewed is copied, so it goes through review like any new event.
export async function duplicateEvent(
  userId: string,
  role: Role,
  eventId: string,
  input: { startsAt: string; endsAt: string }
) {
  const source = await getManagedEvent(userId, role, eventId);

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (startsAt <= new Date()) throw ApiError.badRequest("The new start must be in the future");
  if (endsAt <= startsAt) throw ApiError.badRequest("The new end must be after the new start");

  const tickets = await prisma.ticketType.findMany({ where: { eventId }, orderBy: { createdAt: "asc" } });

  // Early bird windows keep their position relative to the event.
  const shift = startsAt.getTime() - source.startsAt.getTime();
  const shifted = (date: Date | null) => (date ? new Date(date.getTime() + shift) : null);

  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    try {
      return await prisma.event.create({
        data: {
          sellerId: source.sellerId,
          title: source.title,
          slug: generateSlug(source.title),
          description: source.description,
          venue: source.venue,
          city: source.city,
          country: source.country,
          category: source.category,
          bannerUrl: source.bannerUrl,
          startsAt,
          endsAt,
          status: "DRAFT",
          ticketTypes: {
            create: tickets.map((t) => ({
              name: t.name,
              description: t.description,
              tier: t.tier,
              priceCents: t.priceCents,
              currency: t.currency,
              quantity: t.quantity, // sold starts again at 0
              startsAt: shifted(t.startsAt),
              endsAt: shifted(t.endsAt),
              isGroup: t.isGroup,
              minGroupSize: t.minGroupSize,
              maxGroupSize: t.maxGroupSize,
              isActive: t.isActive,
            })),
          },
        },
        include: { ticketTypes: true },
      });
    } catch (err) {
      const slugCollision = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (!slugCollision || attempt === MAX_SLUG_ATTEMPTS) throw err;
    }
  }

  // Unreachable, keeps TypeScript satisfied.
  throw ApiError.badRequest("Could not duplicate the event");
}
// ==========================================
// END OF FILE: backend/src/modules/events/duplicate.service.ts
// ==========================================