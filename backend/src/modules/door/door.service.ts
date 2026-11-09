// ==========================================
// FILE: backend/src/modules/door/door.service.ts
// PURPOSE: Door staff, gates, the events a person can scan, and the live attendance numbers.
// ==========================================
import { Prisma, Role, TicketTier } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { background } from "../../utils/background";
import { sendEmail } from "../../utils/email";
import { staffInviteEmail } from "../../utils/doorTemplates";
import { getManagedEvent } from "../events/event.access";

const DAY_MS = 24 * 60 * 60 * 1000;
const BUCKET_MS = 10 * 60 * 1000;
const MAX_GATES = 12;
const MAX_STAFF = 30;

// Doors can open early, and late arrivals still need to get in. Admins can override both.
export const OPENS_BEFORE_MS = 12 * 60 * 60 * 1000;
export const CLOSES_AFTER_MS = 6 * 60 * 60 * 1000;

const isUnique = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

export interface DoorActor {
  id: string;
  email: string;
  role: Role;
  emailVerified: boolean;
}

export function entryWindow(event: { startsAt: Date; endsAt: Date }) {
  const opensAt = new Date(event.startsAt.getTime() - OPENS_BEFORE_MS);
  const closesAt = new Date(event.endsAt.getTime() + CLOSES_AFTER_MS);
  const now = Date.now();
  return { opensAt, closesAt, open: now >= opensAt.getTime() && now <= closesAt.getTime() };
}

// ------------------------------------------------------------------ who is staff

// The organisers this person works the door for. An invite made by email is claimed here,
// but only once the person's email is verified, so nobody gets in by registering someone else's address.
export async function staffSellerIds(userId: string, email: string, emailVerified: boolean): Promise<string[]> {
  const rows = await prisma.staffMember.findMany({
    where: {
      revokedAt: null,
      OR: [{ userId }, ...(emailVerified ? [{ userId: null, email: email.toLowerCase() }] : [])],
    },
    select: { id: true, sellerId: true, userId: true },
  });

  const unclaimed = rows.filter((r) => r.userId === null).map((r) => r.id);
  if (unclaimed.length > 0) {
    await prisma.staffMember.updateMany({ where: { id: { in: unclaimed }, userId: null }, data: { userId } });
  }

  return [...new Set(rows.map((r) => r.sellerId))];
}

export async function isDoorStaff(userId: string, email: string, emailVerified: boolean): Promise<boolean> {
  return (await staffSellerIds(userId, email, emailVerified)).length > 0;
}

const doorEventSelect = {
  id: true,
  title: true,
  slug: true,
  status: true,
  startsAt: true,
  endsAt: true,
  sellerId: true,
  seller: { select: { userId: true, status: true, businessName: true } },
} satisfies Prisma.EventSelect;

// May this person scan at, and watch the live numbers of, this event?
export async function assertCanDoor(actor: DoorActor, eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: doorEventSelect });
  if (!event) throw ApiError.notFound("Event not found");
  if (actor.role === "ADMIN") return event;

  const own = event.seller.userId === actor.id;
  const staff = !own && (await staffSellerIds(actor.id, actor.email, actor.emailVerified)).includes(event.sellerId);
  if (!own && !staff) throw ApiError.forbidden("You are not part of this event's door team");
  if (event.seller.status !== "APPROVED") throw ApiError.forbidden("This organizer's account is not active");

  return event;
}

// ----------------------------------------------------------- events to scan for

// Live events starting within a week, or ended less than 6 hours ago, for the organiser's own events and any they work the door for.
export async function listScannableEvents(actor: DoorActor) {
  const now = new Date();
  const admin = actor.role === "ADMIN";

  const staffIds = await staffSellerIds(actor.id, actor.email, actor.emailVerified);
  const own = await prisma.sellerProfile.findUnique({ where: { userId: actor.id }, select: { id: true } });
  const sellerIds = [...new Set([...staffIds, ...(own ? [own.id] : [])])];
  if (!admin && sellerIds.length === 0) return [];

  const events = await prisma.event.findMany({
    where: {
      status: { in: ["PUBLISHED", "SOLD_OUT", "TAKEN_DOWN"] },
      endsAt: { gte: new Date(now.getTime() - CLOSES_AFTER_MS) },
      startsAt: { lte: new Date(now.getTime() + 7 * DAY_MS) },
      ...(admin ? {} : { sellerId: { in: sellerIds }, seller: { status: "APPROVED" } }),
    },
    orderBy: { startsAt: "asc" },
    take: 30,
    select: {
      id: true,
      title: true,
      slug: true,
      venue: true,
      city: true,
      startsAt: true,
      endsAt: true,
      status: true,
      seller: { select: { businessName: true } },
      gates: { select: { id: true, name: true, allowedTiers: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (events.length === 0) return [];

  const counts = await prisma.ticket.groupBy({
    by: ["eventId", "status"],
    where: { eventId: { in: events.map((e) => e.id) }, status: { in: ["VALID", "USED"] } },
    _count: { _all: true },
  });

  return events.map((event) => {
    let issued = 0;
    let checkedIn = 0;
    for (const c of counts) {
      if (c.eventId !== event.id) continue;
      issued += c._count._all;
      if (c.status === "USED") checkedIn += c._count._all;
    }
    const { seller, ...rest } = event;
    return { ...rest, organizer: seller.businessName, ticketsIssued: issued, checkedIn, ...entryWindow(event) };
  });
}

// ------------------------------------------------------------- live attendance

export async function getLiveAttendance(actor: DoorActor, eventId: string) {
  const event = await assertCanDoor(actor, eventId);
  const start = Date.now() - 6 * BUCKET_MS;

  const [byType, byGate, recentRows, lastHourRows, types, gates] = await Promise.all([
    prisma.ticket.groupBy({
      by: ["ticketTypeId", "status"],
      where: { eventId, status: { in: ["VALID", "USED"] } },
      _count: { _all: true },
    }),
    prisma.ticket.groupBy({ by: ["gateId"], where: { eventId, status: "USED" }, _count: { _all: true } }),
    prisma.ticket.findMany({
      where: { eventId, status: "USED", usedAt: { not: null } },
      orderBy: [{ usedAt: "desc" }, { id: "desc" }],
      take: 15,
      select: {
        id: true,
        usedAt: true,
        checkedInById: true,
        user: { select: { fullName: true } },
        ticketType: { select: { name: true } },
        gate: { select: { name: true } },
      },
    }),
    prisma.ticket.findMany({ where: { eventId, status: "USED", usedAt: { gte: new Date(start) } }, select: { usedAt: true }, take: 10_000 }),
    prisma.ticketType.findMany({ where: { eventId }, select: { id: true, name: true, tier: true }, orderBy: { priceCents: "asc" } }),
    prisma.gate.findMany({ where: { eventId }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
  ]);

  const issuedBy = new Map<string, number>();
  const usedBy = new Map<string, number>();
  for (const row of byType) {
    issuedBy.set(row.ticketTypeId, (issuedBy.get(row.ticketTypeId) ?? 0) + row._count._all);
    if (row.status === "USED") usedBy.set(row.ticketTypeId, (usedBy.get(row.ticketTypeId) ?? 0) + row._count._all);
  }
  const issued = [...issuedBy.values()].reduce((a, b) => a + b, 0);
  const checkedIn = [...usedBy.values()].reduce((a, b) => a + b, 0);

  const gateCount = new Map<string | null, number>(byGate.map((g) => [g.gateId, g._count._all]));
  const byGateRows = gates.map((g) => ({ gateId: g.id as string | null, name: g.name, checkedIn: gateCount.get(g.id) ?? 0 }));
  const noGate = gateCount.get(null) ?? 0;
  if (noGate > 0) byGateRows.push({ gateId: null, name: "No gate selected", checkedIn: noGate });

  const lastHour = Array.from({ length: 6 }, (_, i) => ({ from: new Date(start + i * BUCKET_MS).toISOString(), count: 0 }));
  for (const row of lastHourRows) {
    if (!row.usedAt) continue;
    const index = Math.min(5, Math.max(0, Math.floor((row.usedAt.getTime() - start) / BUCKET_MS)));
    lastHour[index].count += 1;
  }

  const scannerIds = [...new Set(recentRows.map((r) => r.checkedInById).filter((id): id is string => id !== null))];
  const scanners = scannerIds.length
    ? await prisma.user.findMany({ where: { id: { in: scannerIds } }, select: { id: true, fullName: true } })
    : [];
  const scannerName = new Map(scanners.map((u) => [u.id, u.fullName]));

  return {
    event: { id: event.id, title: event.title, status: event.status, startsAt: event.startsAt, endsAt: event.endsAt, ...entryWindow(event) },
    totals: { issued, checkedIn, remaining: Math.max(issued - checkedIn, 0) },
    byTicketType: types.map((t) => ({ id: t.id, name: t.name, tier: t.tier, issued: issuedBy.get(t.id) ?? 0, checkedIn: usedBy.get(t.id) ?? 0 })),
    byGate: byGateRows,
    lastHour,
    recent: recentRows.map((r) => ({
      id: r.id,
      usedAt: r.usedAt,
      holder: r.user.fullName,
      ticketType: r.ticketType.name,
      gate: r.gate?.name ?? null,
      scannedBy: r.checkedInById ? (scannerName.get(r.checkedInById) ?? null) : null,
    })),
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------- gates

export async function listGates(actor: DoorActor, eventId: string) {
  await assertCanDoor(actor, eventId);
  return await prisma.gate.findMany({
    where: { eventId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, allowedTiers: true, _count: { select: { tickets: true } } },
  });
}

// Only the organiser (or an admin) sets gates up.
export async function createGate(actor: DoorActor, eventId: string, input: { name: string; allowedTiers: TicketTier[] }) {
  await getManagedEvent(actor.id, actor.role, eventId);

  const count = await prisma.gate.count({ where: { eventId } });
  if (count >= MAX_GATES) throw ApiError.badRequest(`An event can have at most ${MAX_GATES} gates`);

  try {
    return await prisma.gate.create({
      data: { eventId, name: input.name, allowedTiers: [...new Set(input.allowedTiers)] },
      select: { id: true, name: true, allowedTiers: true },
    });
  } catch (err) {
    if (isUnique(err)) throw ApiError.conflict("This event already has a gate with that name");
    throw err;
  }
}

// Tickets already scanned through the gate keep their scan. They just no longer name a gate.
export async function deleteGate(actor: DoorActor, eventId: string, gateId: string) {
  await getManagedEvent(actor.id, actor.role, eventId);
  const result = await prisma.gate.deleteMany({ where: { id: gateId, eventId } });
  if (result.count === 0) throw ApiError.notFound("Gate not found");
}

// ---------------------------------------------------------------------- staff

async function ownSeller(userId: string) {
  const seller = await prisma.sellerProfile.findUnique({ where: { userId }, select: { id: true, status: true, businessName: true } });
  if (!seller) throw ApiError.forbidden("Only organizers can manage a door team");
  if (seller.status !== "APPROVED") throw ApiError.forbidden("Your seller account is not active");
  return seller;
}

export async function listStaff(userId: string) {
  const seller = await ownSeller(userId);
  const rows = await prisma.staffMember.findMany({
    where: { sellerId: seller.id, revokedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, userId: true, createdAt: true, user: { select: { fullName: true } } },
  });

  return rows.map((r) => ({ id: r.id, email: r.email, name: r.user?.fullName ?? null, active: r.userId !== null, addedAt: r.createdAt }));
}

export async function addStaff(userId: string, rawEmail: string) {
  const seller = await ownSeller(userId);
  const email = rawEmail.trim().toLowerCase();

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (me?.email.toLowerCase() === email) throw ApiError.badRequest("You can already scan tickets as the organizer");

  const existing = await prisma.staffMember.findUnique({ where: { sellerId_email: { sellerId: seller.id, email } } });
  if (existing && !existing.revokedAt) throw ApiError.conflict("That person is already on your door team");

  const active = await prisma.staffMember.count({ where: { sellerId: seller.id, revokedAt: null } });
  if (active >= MAX_STAFF) throw ApiError.badRequest(`A door team can have at most ${MAX_STAFF} people`);

  // Only a verified account is linked straight away. An unverified one waits until its email is verified.
  const account = await prisma.user.findUnique({ where: { email }, select: { id: true, fullName: true, emailVerified: true, isActive: true } });
  const linked = account && account.isActive && account.emailVerified ? account : null;

  let row;
  try {
    row = existing
      ? await prisma.staffMember.update({ where: { id: existing.id }, data: { revokedAt: null, userId: linked?.id ?? null, addedById: userId } })
      : await prisma.staffMember.create({ data: { sellerId: seller.id, email, userId: linked?.id ?? null, addedById: userId } });
  } catch (err) {
    if (isUnique(err)) throw ApiError.conflict("That person is already on your door team");
    throw err;
  }

  background(sendEmail({ to: email, ...staffInviteEmail({ businessName: seller.businessName, hasAccount: linked !== null }) }), "door staff invite");

  return { id: row.id, email, name: linked?.fullName ?? null, active: linked !== null, addedAt: row.createdAt };
}

// Takes effect immediately: the next scan by that person is refused.
export async function removeStaff(userId: string, staffId: string) {
  const seller = await ownSeller(userId);
  const result = await prisma.staffMember.updateMany({
    where: { id: staffId, sellerId: seller.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) throw ApiError.notFound("Door team member not found");
}
// ==========================================
// END OF FILE: backend/src/modules/door/door.service.ts
// ==========================================