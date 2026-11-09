// ==========================================
// FILE: backend/src/modules/engagement/engagement.service.ts
// PURPOSE: Saved events, followed organisers, email preferences and the public organiser profile.
// ==========================================
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { Pagination, skipTake } from "../../utils/pagination";

const MAX_FAVORITES = 500;
const MAX_FOLLOWS = 200;

const liveNow = () => ({ status: "PUBLISHED" as const, endsAt: { gte: new Date() } });

const activeTickets = {
  where: { isActive: true },
  orderBy: { priceCents: "asc" },
} satisfies Prisma.Event$ticketTypesArgs;

// ---------------------------------------------------------------- saved events

// Only events that are still on sale and haven't ended are listed.
export async function listFavorites(userId: string, pagination: Pagination) {
  const where: Prisma.FavoriteWhereInput = { userId, event: liveNow() };

  const [rows, total] = await prisma.$transaction([
    prisma.favorite.findMany({
      where,
      include: { event: { include: { ticketTypes: activeTickets } } },
      orderBy: [{ createdAt: "desc" }, { eventId: "asc" }],
      ...skipTake(pagination),
    }),
    prisma.favorite.count({ where }),
  ]);

  return { items: rows.map((r) => r.event), total, page: pagination.page, limit: pagination.limit };
}

export async function favoriteIds(userId: string): Promise<string[]> {
  const rows = await prisma.favorite.findMany({ where: { userId }, select: { eventId: true }, take: MAX_FAVORITES });
  return rows.map((r) => r.eventId);
}

// Saving the same event twice is fine: it just stays saved.
export async function addFavorite(userId: string, eventId: string): Promise<void> {
  const event = await prisma.event.findFirst({ where: { id: eventId, status: "PUBLISHED" }, select: { id: true } });
  if (!event) throw ApiError.notFound("Event not found");

  const saved = await prisma.favorite.count({ where: { userId } });
  if (saved >= MAX_FAVORITES) throw ApiError.badRequest("You have saved as many events as you can. Remove some first.");

  await prisma.favorite.upsert({
    where: { userId_eventId: { userId, eventId } },
    create: { userId, eventId },
    update: {},
  });
}

export async function removeFavorite(userId: string, eventId: string): Promise<void> {
  await prisma.favorite.deleteMany({ where: { userId, eventId } });
}

// ------------------------------------------------------------------- following

export async function followIds(userId: string): Promise<string[]> {
  const rows = await prisma.follow.findMany({ where: { userId }, select: { sellerId: true }, take: MAX_FOLLOWS });
  return rows.map((r) => r.sellerId);
}

export async function listFollowing(userId: string, pagination: Pagination) {
  const where: Prisma.FollowWhereInput = { userId, seller: { status: "APPROVED" } };

  const [rows, total] = await prisma.$transaction([
    prisma.follow.findMany({
      where,
      select: { seller: { select: { id: true, businessName: true, _count: { select: { followers: true } } } } },
      orderBy: [{ createdAt: "desc" }, { sellerId: "asc" }],
      ...skipTake(pagination),
    }),
    prisma.follow.count({ where }),
  ]);

  const ids = rows.map((r) => r.seller.id);
  const live = ids.length
    ? await prisma.event.groupBy({ by: ["sellerId"], where: { sellerId: { in: ids }, ...liveNow() }, _count: { _all: true } })
    : [];
  const liveBy = new Map(live.map((l) => [l.sellerId, l._count._all]));

  return {
    items: rows.map((r) => ({
      id: r.seller.id,
      businessName: r.seller.businessName,
      followers: r.seller._count.followers,
      upcomingEvents: liveBy.get(r.seller.id) ?? 0,
    })),
    total,
    page: pagination.page,
    limit: pagination.limit,
  };
}

export async function followOrganizer(userId: string, sellerId: string): Promise<void> {
  const seller = await prisma.sellerProfile.findFirst({ where: { id: sellerId, status: "APPROVED" }, select: { id: true, userId: true } });
  if (!seller) throw ApiError.notFound("Organizer not found");
  if (seller.userId === userId) throw ApiError.badRequest("You can't follow your own organizer account");

  const following = await prisma.follow.count({ where: { userId } });
  if (following >= MAX_FOLLOWS) throw ApiError.badRequest("You follow as many organizers as you can. Unfollow some first.");

  await prisma.follow.upsert({
    where: { userId_sellerId: { userId, sellerId } },
    create: { userId, sellerId },
    update: {},
  });
}

export async function unfollowOrganizer(userId: string, sellerId: string): Promise<void> {
  await prisma.follow.deleteMany({ where: { userId, sellerId } });
}

// ---------------------------------------------------------------- preferences

const prefsSelect = { notifyReminders: true, notifyNewEvents: true } as const;

export async function getPreferences(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: prefsSelect });
  if (!user) throw ApiError.notFound("User not found");
  return user;
}

export async function setPreferences(userId: string, input: { notifyReminders?: boolean; notifyNewEvents?: boolean }) {
  return await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.notifyReminders !== undefined && { notifyReminders: input.notifyReminders }),
      ...(input.notifyNewEvents !== undefined && { notifyNewEvents: input.notifyNewEvents }),
    },
    select: prefsSelect,
  });
}

// ----------------------------------------------------- the public organiser page

// Only what anyone may see: no email, phone or payout details.
export async function getOrganizer(sellerId: string) {
  const seller = await prisma.sellerProfile.findFirst({
    where: { id: sellerId, status: "APPROVED" },
    select: { id: true, businessName: true, createdAt: true, _count: { select: { followers: true } } },
  });
  if (!seller) throw ApiError.notFound("Organizer not found");

  const [upcomingEvents, hostedEvents] = await Promise.all([
    prisma.event.count({ where: { sellerId, ...liveNow() } }),
    prisma.event.count({ where: { sellerId, status: { in: ["PUBLISHED", "SOLD_OUT", "COMPLETED"] }, endsAt: { lt: new Date() } } }),
  ]);

  return {
    id: seller.id,
    businessName: seller.businessName,
    memberSince: seller.createdAt,
    followers: seller._count.followers,
    upcomingEvents,
    hostedEvents,
  };
}
// ==========================================
// END OF FILE: backend/src/modules/engagement/engagement.service.ts
// ==========================================