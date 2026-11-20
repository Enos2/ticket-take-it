// ==========================================
// FILE: backend/src/modules/door/offline.service.ts
// PURPOSE: Offline gate scanning: builds the gate pack a phone downloads, and applies the scans a phone made without internet when it reconnects.
// ==========================================
import { Prisma, TicketTier } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { assertCanDoor, entryWindow } from "./door.service";
import type { DoorActor } from "./door.service";
import { OUTCOME_MESSAGE, clampScanTime, decideScan, hashTicketCode } from "./offline.rules";
import type { OfflineOutcome } from "./offline.rules";

export const MAX_PACK_TICKETS = 50_000;
export const MAX_SCANS_PER_SYNC = 200;

const isUnique = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

// ---------------------------------------------------------------- the gate pack

export interface OfflinePack {
  version: 1;
  generatedAt: string;
  enforceWindow: boolean; // admins may scan outside the entry window, everyone else may not
  event: { id: string; title: string; startsAt: Date; endsAt: Date; opensAt: Date; closesAt: Date };
  gates: { id: string; name: string; allowedTiers: TicketTier[] }[];
  // One row per ticket that can be scanned. `h` is the hash of the ticket code. The code itself is never sent.
  tickets: { h: string; id: string; type: string; tier: TicketTier; name: string; seat: string | null; usedAt: Date | null }[];
}

// Everything a phone needs to check tickets at one event with no internet.
export async function buildOfflinePack(actor: DoorActor, eventId: string): Promise<OfflinePack> {
  const event = await assertCanDoor(actor, eventId);
  if (event.status === "CANCELLED") throw ApiError.conflict("This event was cancelled");

  const [gates, rows] = await Promise.all([
    prisma.gate.findMany({
      where: { eventId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, allowedTiers: true },
    }),
    prisma.ticket.findMany({
      where: { eventId, status: { in: ["VALID", "USED"] } },
      orderBy: { id: "asc" },
      take: MAX_PACK_TICKETS + 1,
      select: {
        id: true,
        code: true,
        usedAt: true,
        ticketType: { select: { name: true, tier: true } },
        user: { select: { fullName: true } },
        seat: { select: { row: true, number: true, section: { select: { name: true } } } },
      },
    }),
  ]);

  if (rows.length > MAX_PACK_TICKETS) {
    throw ApiError.badRequest(`This event has more than ${MAX_PACK_TICKETS} tickets, which is too many for an offline pack`);
  }

  const window = entryWindow(event);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    enforceWindow: actor.role !== "ADMIN",
    event: { id: event.id, title: event.title, startsAt: event.startsAt, endsAt: event.endsAt, opensAt: window.opensAt, closesAt: window.closesAt },
    gates,
    tickets: rows.map((t) => ({
      h: hashTicketCode(t.code),
      id: t.id,
      type: t.ticketType.name,
      tier: t.ticketType.tier,
      name: t.user.fullName,
      seat: t.seat ? `${t.seat.section.name}, Row ${t.seat.row}, Seat ${t.seat.number}` : null,
      usedAt: t.usedAt,
    })),
  };
}

// ---------------------------------------------------------------- uploading offline scans

export interface SyncScanInput {
  id: string; // made by the phone, so an upload that is sent twice is never counted twice
  code: string;
  scannedAt: string;
  gateId?: string;
}

export interface SyncResultRow {
  id: string;
  outcome: OfflineOutcome;
  message: string;
  holder?: string;
  ticketType?: string;
  firstUsedAt?: string;
  repeat?: true; // this scan was already uploaded earlier
}

export async function syncOfflineScans(actor: DoorActor, input: { eventId: string; deviceId: string; scans: SyncScanInput[] }) {
  const event = await assertCanDoor(actor, input.eventId);
  const now = new Date();

  const [existing, tickets, gates] = await Promise.all([
    prisma.offlineScan.findMany({
      where: { eventId: event.id, clientId: { in: input.scans.map((s) => s.id) } },
      select: { clientId: true, outcome: true },
    }),
    prisma.ticket.findMany({
      where: { code: { in: [...new Set(input.scans.map((s) => s.code))] } },
      select: {
        id: true,
        code: true,
        eventId: true,
        status: true,
        ticketType: { select: { name: true, tier: true } },
        user: { select: { fullName: true } },
      },
    }),
    prisma.gate.findMany({ where: { eventId: event.id }, select: { id: true, allowedTiers: true } }),
  ]);

  const doneBefore = new Map(existing.map((e) => [e.clientId, e.outcome]));
  const ticketByCode = new Map(tickets.map((t) => [t.code, t]));
  const gateById = new Map(gates.map((g) => [g.id, g]));

  const results: SyncResultRow[] = [];

  for (const scan of input.scans) {
    // An upload that was already received (a retry after a bad connection) gives the same answer again.
    const earlier = doneBefore.get(scan.id);
    if (earlier) {
      results.push({ id: scan.id, outcome: earlier, message: OUTCOME_MESSAGE[earlier], repeat: true });
      continue;
    }

    const ticket = ticketByCode.get(scan.code) ?? null;
    const gate = scan.gateId ? (gateById.get(scan.gateId) ?? null) : null;
    const decision = decideScan(
      ticket ? { eventId: ticket.eventId, status: ticket.status, tier: ticket.ticketType.tier } : null,
      event.id,
      scan.gateId !== undefined,
      gate
    );
    const scannedAt = clampScanTime(new Date(scan.scannedAt), now);

    const record = {
      eventId: event.id,
      clientId: scan.id,
      deviceId: input.deviceId,
      scannedById: actor.id,
      scannedAt,
      ticketId: ticket?.id ?? null,
      gateId: gate?.id ?? null,
    };

    try {
      let outcome: OfflineOutcome;

      if (decision === "CLAIM" && ticket) {
        // ATOMIC, exactly like an online scan: only one scan can turn VALID into USED.
        // The ticket is marked with the time the phone scanned it, not the time it was uploaded.
        outcome = await prisma.$transaction(async (tx) => {
          const claimed = await tx.ticket.updateMany({
            where: { id: ticket.id, status: "VALID" },
            data: { status: "USED", usedAt: scannedAt, checkedInById: actor.id, gateId: gate ? gate.id : undefined },
          });
          const result: OfflineOutcome = claimed.count === 1 ? "ADMITTED" : "ALREADY_USED";
          await tx.offlineScan.create({ data: { ...record, outcome: result, detail: OUTCOME_MESSAGE[result] } });
          return result;
        });
      } else {
        outcome = decision === "CLAIM" ? "UNKNOWN_TICKET" : decision;
        await prisma.offlineScan.create({ data: { ...record, outcome, detail: OUTCOME_MESSAGE[outcome] } });
      }

      const row: SyncResultRow = { id: scan.id, outcome, message: OUTCOME_MESSAGE[outcome] };
      if (ticket) {
        row.holder = ticket.user.fullName;
        row.ticketType = ticket.ticketType.name;
      }
      if (outcome === "ALREADY_USED" && ticket) {
        const current = await prisma.ticket.findUnique({ where: { id: ticket.id }, select: { usedAt: true } });
        if (current?.usedAt) row.firstUsedAt = current.usedAt.toISOString();
      }
      results.push(row);
    } catch (err) {
      // The same scan arrived twice at the same moment. The first one wins, and this one repeats its answer.
      if (!isUnique(err)) throw err;
      const first = await prisma.offlineScan.findUnique({
        where: { eventId_clientId: { eventId: event.id, clientId: scan.id } },
        select: { outcome: true },
      });
      const outcome = first?.outcome ?? "ALREADY_USED";
      results.push({ id: scan.id, outcome, message: OUTCOME_MESSAGE[outcome], repeat: true });
    }
  }

  const summary: Record<OfflineOutcome, number> = {
    ADMITTED: 0,
    ALREADY_USED: 0,
    UNKNOWN_TICKET: 0,
    WRONG_EVENT: 0,
    TICKET_VOIDED: 0,
    WRONG_GATE: 0,
  };
  for (const r of results) summary[r.outcome] += 1;

  return { results, summary };
}

// ---------------------------------------------------------------- reviewing problems

// Scans that did not simply admit someone, for the organiser to look at.
export async function listOfflineConflicts(actor: DoorActor, eventId: string) {
  await assertCanDoor(actor, eventId);

  const [counts, rows] = await Promise.all([
    prisma.offlineScan.groupBy({ by: ["outcome"], where: { eventId }, _count: { _all: true } }),
    prisma.offlineScan.findMany({
      where: { eventId, outcome: { not: "ADMITTED" } },
      orderBy: { receivedAt: "desc" },
      take: 100,
      select: { id: true, outcome: true, detail: true, scannedAt: true, receivedAt: true, deviceId: true, scannedById: true, ticketId: true, gateId: true },
    }),
  ]);

  const ticketIds = rows.map((r) => r.ticketId).filter((id): id is string => id !== null);
  const userIds = [...new Set(rows.map((r) => r.scannedById))];
  const gateIds = rows.map((r) => r.gateId).filter((id): id is string => id !== null);

  const [tickets, users, gates] = await Promise.all([
    ticketIds.length
      ? prisma.ticket.findMany({
          where: { id: { in: ticketIds } },
          select: { id: true, ticketType: { select: { name: true } }, user: { select: { fullName: true } } },
        })
      : [],
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }),
    gateIds.length ? prisma.gate.findMany({ where: { id: { in: gateIds } }, select: { id: true, name: true } }) : [],
  ]);

  const ticketById = new Map(tickets.map((t) => [t.id, t]));
  const userName = new Map(users.map((u) => [u.id, u.fullName]));
  const gateName = new Map(gates.map((g) => [g.id, g.name]));

  const total: Record<string, number> = {};
  for (const c of counts) total[c.outcome] = c._count._all;

  return {
    counts: total,
    conflicts: rows.map((r) => ({
      id: r.id,
      outcome: r.outcome,
      detail: r.detail,
      scannedAt: r.scannedAt,
      receivedAt: r.receivedAt,
      deviceId: r.deviceId,
      scannedBy: userName.get(r.scannedById) ?? null,
      holder: r.ticketId ? (ticketById.get(r.ticketId)?.user.fullName ?? null) : null,
      ticketType: r.ticketId ? (ticketById.get(r.ticketId)?.ticketType.name ?? null) : null,
      gate: r.gateId ? (gateName.get(r.gateId) ?? null) : null,
    })),
  };
}
// ==========================================
// END OF FILE: backend/src/modules/door/offline.service.ts
// ==========================================