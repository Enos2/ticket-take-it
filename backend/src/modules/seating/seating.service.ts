// ==========================================
// FILE: backend/src/modules/seating/seating.service.ts
// PURPOSE: Seat layouts, the seat map, blocking seats and giving blocked seats to guests.
// ==========================================
import { randomBytes } from "crypto";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { background } from "../../utils/background";
import { getManagedEvent } from "../events/event.access";
import { lockEvent, syncSoldOut } from "../events/capacity.service";
import { issueTicketsForOrder } from "../orders/fulfillment.service";
import { notifyOrderPaid } from "../notifications/notifications.service";
import { compareRows, rowLabel, seatState } from "./seatHolds";
import { BlockSeatsInput, GiveSeatsInput, SaveLayoutInput } from "./seating.schema";

type Db = Prisma.TransactionClient;

function assertEditable(event: { status: string; endsAt: Date }) {
  if (event.status === "PENDING_REVIEW") {
    throw ApiError.badRequest("This event is waiting for review. Withdraw it from review to change its seats.");
  }
  if (event.status === "CANCELLED" || event.status === "COMPLETED" || event.endsAt < new Date()) {
    throw ApiError.badRequest("Seats cannot be changed on an event that has ended or been cancelled");
  }
}

// ---------------------------------------------------------------- the map

type PublicSeatState = "available" | "held" | "taken";
type SellerSeatState = "available" | "held" | "sold" | "blocked" | "given";

// One section after another, each with its rows and seats in reading order.
async function buildMap(eventId: string, forSeller: boolean) {
  const now = new Date();

  const sections = await prisma.seatSection.findMany({
    where: { eventId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      ticketType: { select: { id: true, name: true, tier: true, priceCents: true, currency: true, isActive: true } },
      seats: { select: { id: true, row: true, number: true, isBlocked: true, heldByOrderId: true, heldUntil: true, ticketId: true } },
    },
  });

  return {
    eventId,
    sections: sections.map((section) => {
      const seats = [...section.seats].sort((a, b) => compareRows(a.row, b.row) || a.number - b.number);
      const rows: { row: string; seats: { id: string; number: number; state: PublicSeatState | SellerSeatState }[] }[] = [];

      for (const seat of seats) {
        const raw = seatState(seat, now);
        // The public sees only whether a seat can be chosen. The seller also sees blocked and given seats.
        const state: PublicSeatState | SellerSeatState = forSeller
          ? raw === "sold" && seat.isBlocked
            ? "given"
            : raw
          : raw === "available" || raw === "held"
            ? raw
            : "taken";

        let current = rows[rows.length - 1];
        if (!current || current.row !== seat.row) {
          current = { row: seat.row, seats: [] };
          rows.push(current);
        }
        current.seats.push({ id: seat.id, number: seat.number, state });
      }

      return { id: section.id, name: section.name, ticketType: section.ticketType, rows };
    }),
  };
}

export async function getPublicSeatMap(eventId: string) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, status: { in: ["PUBLISHED", "SOLD_OUT"] } },
    select: { id: true },
  });
  if (!event) throw ApiError.notFound("Event not found");
  return await buildMap(eventId, false);
}

export async function getManageSeatMap(userId: string, role: Role, eventId: string) {
  await getManagedEvent(userId, role, eventId);
  return await buildMap(eventId, true);
}

// ---------------------------------------------------------------- the layout

// The layout can only be replaced while nothing has been sold, held or ordered on it.
async function assertLayoutUnused(tx: Db, eventId: string) {
  const now = new Date();

  const taken = await tx.seat.count({
    where: { eventId, OR: [{ ticketId: { not: null } }, { heldUntil: { gt: now } }] },
  });
  const ordered = await tx.orderSeat.count({
    where: { seat: { eventId }, order: { status: { in: ["PENDING", "RESERVED", "PAID"] } } },
  });

  if (taken > 0 || ordered > 0) {
    throw ApiError.conflict("Seats from this event were already sold or are being held by a buyer, so the layout cannot be replaced.");
  }
}

// Seats that were blocked count as "kept for guests". Removing them gives those tickets back.
async function releaseBlockedSeats(tx: Db, eventId: string) {
  const blocked = await tx.seat.findMany({
    where: { eventId, isBlocked: true },
    select: { section: { select: { ticketTypeId: true } } },
  });

  const counts = new Map<string, number>();
  for (const seat of blocked) counts.set(seat.section.ticketTypeId, (counts.get(seat.section.ticketTypeId) ?? 0) + 1);

  for (const [ticketTypeId, count] of [...counts].sort()) {
    await tx.ticketType.update({ where: { id: ticketTypeId }, data: { hostReserved: { decrement: count } } });
  }
}

export async function saveLayout(userId: string, role: Role, eventId: string, input: SaveLayoutInput) {
  const event = await getManagedEvent(userId, role, eventId);
  assertEditable(event);

  const typeIds = [...new Set(input.sections.map((s) => s.ticketTypeId))];

  await prisma.$transaction(
    async (tx) => {
      await lockEvent(tx, eventId);

      const types = await tx.ticketType.findMany({ where: { id: { in: typeIds }, eventId } });
      if (types.length !== typeIds.length) {
        throw ApiError.badRequest("A section uses a ticket type that does not belong to this event");
      }

      await assertLayoutUnused(tx, eventId);
      await releaseBlockedSeats(tx, eventId);
      await tx.seatSection.deleteMany({ where: { eventId } }); // seats and their order links go with it

      // A ticket type that already sold general admission tickets cannot suddenly become seated.
      const fresh = await tx.ticketType.findMany({ where: { id: { in: typeIds } }, select: { id: true, name: true, sold: true, hostIssued: true } });
      for (const type of fresh) {
        if (type.sold > 0 || type.hostIssued > 0) {
          throw ApiError.conflict(`${type.name} already has tickets sold, held or given out, so it cannot be turned into seats.`);
        }
      }

      const seatsPerType = new Map<string, number>();

      for (const [index, section] of input.sections.entries()) {
        const created = await tx.seatSection.create({
          data: { eventId, ticketTypeId: section.ticketTypeId, name: section.name, sortOrder: index },
        });

        const seats: { eventId: string; sectionId: string; row: string; number: number }[] = [];
        for (let r = 0; r < section.rows; r++) {
          for (let n = 1; n <= section.seatsPerRow; n++) seats.push({ eventId, sectionId: created.id, row: rowLabel(r), number: n });
        }
        await tx.seat.createMany({ data: seats });

        seatsPerType.set(section.ticketTypeId, (seatsPerType.get(section.ticketTypeId) ?? 0) + seats.length);
      }

      // For a seated ticket type the seats ARE the stock.
      for (const [ticketTypeId, count] of [...seatsPerType].sort()) {
        await tx.ticketType.update({ where: { id: ticketTypeId }, data: { quantity: count, hostReserved: 0 } });
      }

      await syncSoldOut(tx, [eventId]);
    },
    { timeout: 30_000 } // a large venue creates thousands of seats
  );

  return await buildMap(eventId, true);
}

export async function deleteLayout(userId: string, role: Role, eventId: string) {
  const event = await getManagedEvent(userId, role, eventId);
  assertEditable(event);

  await prisma.$transaction(async (tx) => {
    await lockEvent(tx, eventId);
    await assertLayoutUnused(tx, eventId);
    await releaseBlockedSeats(tx, eventId);
    await tx.seatSection.deleteMany({ where: { eventId } });
    await syncSoldOut(tx, [eventId]);
  });
}

// ---------------------------------------------------------------- keeping seats for guests

// Blocks seats (kept off public sale) or puts them back on sale. Blocked seats count as "kept for guests".
export async function blockSeats(userId: string, role: Role, eventId: string, input: BlockSeatsInput) {
  const event = await getManagedEvent(userId, role, eventId);
  assertEditable(event);

  const seatIds = [...new Set(input.seatIds)].sort();
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await lockEvent(tx, eventId);

    const seats = await tx.seat.findMany({
      where: { id: { in: seatIds }, eventId },
      select: { id: true, row: true, number: true, section: { select: { name: true, ticketTypeId: true } } },
      orderBy: { id: "asc" },
    });
    if (seats.length !== seatIds.length) throw ApiError.notFound("One of the seats was not found");

    const counts = new Map<string, number>();

    for (const seat of seats) {
      const label = `${seat.section.name} ${seat.row}${seat.number}`;

      const changed = input.blocked
        ? await tx.$executeRaw`
            UPDATE "Seat" SET "isBlocked" = true
            WHERE "id" = ${seat.id} AND "isBlocked" = false AND "ticketId" IS NULL AND "heldByOrderId" IS NULL`
        : await tx.$executeRaw`
            UPDATE "Seat" SET "isBlocked" = false
            WHERE "id" = ${seat.id} AND "isBlocked" = true AND "ticketId" IS NULL`;

      if (changed === 0) {
        throw ApiError.badRequest(
          input.blocked
            ? `Seat ${label} is sold, held by a buyer or already blocked`
            : `Seat ${label} is not blocked, or was already given to a guest`
        );
      }

      counts.set(seat.section.ticketTypeId, (counts.get(seat.section.ticketTypeId) ?? 0) + 1);
    }

    for (const [ticketTypeId, count] of [...counts].sort()) {
      const moved = input.blocked
        ? await tx.$executeRaw`
            UPDATE "TicketType"
            SET "hostReserved" = "hostReserved" + ${count}, "updatedAt" = ${now}
            WHERE "id" = ${ticketTypeId} AND "sold" + ("hostReserved" - "hostIssued") + ${count} <= "quantity"`
        : await tx.$executeRaw`
            UPDATE "TicketType"
            SET "hostReserved" = "hostReserved" - ${count}, "updatedAt" = ${now}
            WHERE "id" = ${ticketTypeId} AND "hostReserved" - "hostIssued" >= ${count}`;

      if (moved === 0) throw ApiError.conflict("The ticket numbers changed while saving. Please refresh and try again.");
    }

    await syncSoldOut(tx, [eventId]);
  });

  return await buildMap(eventId, true);
}

// Gives blocked seats to a registered guest as free tickets. Each ticket is tied to its seat.
export async function giveSeats(userId: string, role: Role, eventId: string, input: GiveSeatsInput) {
  const event = await getManagedEvent(userId, role, eventId);
  if (event.status !== "PUBLISHED" && event.status !== "SOLD_OUT") {
    throw ApiError.badRequest("Seats can only be given out while the event is on sale");
  }
  if (event.endsAt < new Date()) throw ApiError.badRequest("This event has already ended");

  const recipient = await prisma.user.findFirst({
    where: { email: input.recipientEmail, isActive: true, deletedAt: null },
    select: { id: true, email: true, fullName: true },
  });
  if (!recipient) throw ApiError.notFound("No account uses that email. Ask your guest to sign up first, then try again.");

  const seatIds = [...new Set(input.seatIds)].sort();
  const now = new Date();

  const order = await prisma.$transaction(async (tx) => {
    const seats = await tx.seat.findMany({
      where: { id: { in: seatIds }, eventId },
      select: {
        id: true,
        isBlocked: true,
        ticketId: true,
        section: { select: { ticketTypeId: true, ticketType: { select: { currency: true } } } },
      },
    });
    if (seats.length !== seatIds.length) throw ApiError.notFound("One of the seats was not found");
    if (seats.some((s) => !s.isBlocked || s.ticketId)) {
      throw ApiError.badRequest("Only blocked seats that were not given out yet can be given to a guest. Block the seats first.");
    }

    const counts = new Map<string, number>();
    for (const seat of seats) counts.set(seat.section.ticketTypeId, (counts.get(seat.section.ticketTypeId) ?? 0) + 1);

    // Takes from the kept-for-guests pool only, exactly like giving out plain tickets.
    for (const [ticketTypeId, count] of [...counts].sort()) {
      const claimed = await tx.$executeRaw`
        UPDATE "TicketType"
        SET "sold" = "sold" + ${count}, "hostIssued" = "hostIssued" + ${count}, "updatedAt" = ${now}
        WHERE "id" = ${ticketTypeId} AND "hostReserved" - "hostIssued" >= ${count}`;
      if (claimed === 0) throw ApiError.conflict("The kept seats changed while saving. Please refresh and try again.");
    }

    const created = await tx.order.create({
      data: {
        reference: `CMP-${randomBytes(5).toString("hex").toUpperCase()}`,
        userId: recipient.id,
        status: "PAID",
        totalCents: 0,
        currency: seats[0].section.ticketType.currency,
        paidAt: now,
        isComp: true,
        compIssuedById: userId,
        compNote: input.note ?? null,
        items: {
          create: [...counts].sort().map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity, unitPriceCents: 0, subtotalCents: 0 })),
        },
      },
    });

    await tx.orderSeat.createMany({ data: seatIds.map((seatId) => ({ orderId: created.id, seatId })) });

    // Creates the tickets and ties each one to a seat.
    await issueTicketsForOrder(tx, created.id);
    return created;
  });

  background(notifyOrderPaid(order.id), "complimentary seat email");

  return { orderId: order.id, reference: order.reference, seats: seatIds.length, recipient: { email: recipient.email, fullName: recipient.fullName } };
}
// ==========================================
// END OF FILE: backend/src/modules/seating/seating.service.ts
// ==========================================