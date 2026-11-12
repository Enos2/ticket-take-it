// ==========================================
// FILE: backend/src/modules/events/capacity.service.ts
// PURPOSE: All stock rules in one place: held-back tickets, event capacity, atomic claims and the automatic SOLD_OUT status.
// ==========================================
import { Prisma, TicketTier } from "@prisma/client";
import { prisma } from "../../config/database";
import { logger } from "../../utils/logger";

type Db = Prisma.TransactionClient;

export interface StockRow {
  quantity: number;
  sold: number; // unpaid holds + paid tickets + complimentary tickets
  hostReserved: number;
  hostIssued: number;
  isActive: boolean;
  tier?: TicketTier;
  endsAt?: Date | null;
}

// Tickets still held back for the seller to give out.
export const reservedRemaining = (t: Pick<StockRow, "hostReserved" | "hostIssued">) =>
  Math.max(t.hostReserved - t.hostIssued, 0);

// What the public can still buy of one ticket type, ignoring the event-wide capacity.
export const typeAvailable = (t: StockRow) => Math.max(t.quantity - t.sold - reservedRemaining(t), 0);

// An early bird type whose window has closed can never sell again, so it does not keep an event "on sale".
function stillSelling(t: StockRow, now: Date) {
  if (!t.isActive) return false;
  return !(t.tier === "EARLY_BIRD" && t.endsAt && t.endsAt < now);
}

// How many tickets the public can still buy across the whole event.
export function publicAvailability(maxCapacity: number | null, types: StockRow[], now = new Date()): number {
  const perType = types.filter((t) => stillSelling(t, now)).reduce((sum, t) => sum + typeAvailable(t), 0);
  if (maxCapacity === null) return perType;

  const committed = types.reduce((sum, t) => sum + t.sold + reservedRemaining(t), 0);
  return Math.min(perType, Math.max(maxCapacity - committed, 0));
}

// ---------------------------------------------------------------- locks

// Takes a row lock on the event until the transaction ends. Used by every change that affects capacity.
export async function lockEvent(tx: Db, eventId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${eventId} FOR UPDATE`;
}

// Takes a row lock on one ticket type until the transaction ends.
export async function lockTicketType(tx: Db, ticketTypeId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "TicketType" WHERE "id" = ${ticketTypeId} FOR UPDATE`;
}

// Locks the events (in a fixed order, so nobody deadlocks) that have a capacity limit.
// Events without a limit are not locked, so they keep selling in parallel.
export async function lockCapacityEvents(tx: Db, ticketTypeIds: string[]): Promise<void> {
  if (ticketTypeIds.length === 0) return;

  const rows = await tx.ticketType.findMany({
    where: { id: { in: ticketTypeIds }, event: { maxCapacity: { not: null } } },
    select: { eventId: true },
  });

  const eventIds = [...new Set(rows.map((r) => r.eventId))].sort();
  for (const eventId of eventIds) await lockEvent(tx, eventId);
}

// ---------------------------------------------------------------- counting

// Seats already taken or promised: sold (holds included) plus tickets still held back for the seller.
export async function committedCapacity(tx: Db, eventId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ committed: number }[]>`
    SELECT COALESCE(SUM("sold" + ("hostReserved" - "hostIssued")), 0)::int AS "committed"
    FROM "TicketType"
    WHERE "eventId" = ${eventId}`;
  return rows[0]?.committed ?? 0;
}

// How many more tickets the event can take before it reaches its capacity.
export async function capacityRoom(tx: Db, eventId: string, maxCapacity: number): Promise<number> {
  return maxCapacity - (await committedCapacity(tx, eventId));
}

// ---------------------------------------------------------------- claiming

// Takes tickets from the public stock in ONE conditional UPDATE. Held-back tickets are never touched.
// Postgres re-checks the WHERE clause under the row lock, so a buyer who lost the race matches zero rows.
export async function claimStock(tx: Db, ticketTypeId: string, quantity: number): Promise<boolean> {
  const changed = await tx.$executeRaw`
    UPDATE "TicketType"
    SET "sold" = "sold" + ${quantity}, "updatedAt" = NOW()
    WHERE "id" = ${ticketTypeId}
      AND "isActive" = true
      AND "sold" + ${quantity} <= "quantity" - ("hostReserved" - "hostIssued")`;
  return changed > 0;
}

// ---------------------------------------------------------------- sold-out status

// Moves live events between PUBLISHED and SOLD_OUT to match their real stock.
// Returns how many events changed. Other statuses (draft, cancelled, taken down...) are never touched.
export async function syncSoldOut(db: Db, eventIds: string[]): Promise<number> {
  let changed = 0;

  for (const eventId of [...new Set(eventIds)].sort()) {
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: {
        status: true,
        maxCapacity: true,
        ticketTypes: {
          select: { quantity: true, sold: true, hostReserved: true, hostIssued: true, isActive: true, tier: true, endsAt: true },
        },
      },
    });
    if (!event) continue;
    if (event.status !== "PUBLISHED" && event.status !== "SOLD_OUT") continue;
    if (!event.ticketTypes.some((t) => t.isActive)) continue; // nothing is for sale, so "sold out" would be wrong

    const soldOut = publicAvailability(event.maxCapacity, event.ticketTypes) <= 0;

    if (soldOut && event.status === "PUBLISHED") {
      const flipped = await db.event.updateMany({ where: { id: eventId, status: "PUBLISHED" }, data: { status: "SOLD_OUT" } });
      changed += flipped.count;
    } else if (!soldOut && event.status === "SOLD_OUT") {
      const flipped = await db.event.updateMany({ where: { id: eventId, status: "SOLD_OUT" }, data: { status: "PUBLISHED" } });
      changed += flipped.count;
    }
  }

  return changed;
}

export async function syncSoldOutForTicketTypes(db: Db, ticketTypeIds: string[]): Promise<number> {
  if (ticketTypeIds.length === 0) return 0;
  const rows = await db.ticketType.findMany({ where: { id: { in: ticketTypeIds } }, select: { eventId: true } });
  return await syncSoldOut(db, rows.map((r) => r.eventId));
}

// Runs after a purchase has been committed, so it sees every concurrent purchase. A failure here never fails the order.
export async function syncSoldOutSafely(ticketTypeIds: string[]): Promise<void> {
  try {
    await syncSoldOutForTicketTypes(prisma, ticketTypeIds);
  } catch (err) {
    logger.error({ err }, "Could not update the sold-out status");
  }
}

// Background job: repairs any event whose status drifted (for example two buyers taking the last two tickets at once).
export async function reconcileSoldOut(): Promise<number> {
  const events = await prisma.event.findMany({
    where: { status: { in: ["PUBLISHED", "SOLD_OUT"] }, endsAt: { gte: new Date() } },
    select: { id: true },
    orderBy: { startsAt: "asc" },
    take: 500,
  });
  return await syncSoldOut(prisma, events.map((e) => e.id));
}
// ==========================================
// END OF FILE: backend/src/modules/events/capacity.service.ts
// ==========================================