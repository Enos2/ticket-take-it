// ==========================================
// FILE: backend/src/modules/events/moderation.service.ts
// PURPOSE: Event review workflow: submit, withdraw, approve, reject, take down and restore.
// ==========================================
import { EventStatus, Role } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { logger } from "../../utils/logger";
import { getManagedEvent } from "./event.access";
import { background } from "../../utils/background";
import { notifyEventReview } from "../notifications/reviewNotifications.service";

const SUBMITTABLE: EventStatus[] = ["DRAFT", "REJECTED"];
const LIVE: EventStatus[] = ["PUBLISHED", "SOLD_OUT"];

const words = (status: EventStatus) => status.replace("_", " ").toLowerCase();
const reload = (eventId: string) => prisma.event.findUniqueOrThrow({ where: { id: eventId } });

async function findEvent(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { seller: { select: { status: true } } },
  });
  if (!event) throw ApiError.notFound("Event not found");
  return event;
}

// What must be true before an event can go in front of the public.
async function readinessProblems(event: { id: string; startsAt: Date; endsAt: Date }): Promise<string[]> {
  const problems: string[] = [];
  const now = new Date();

  if (event.endsAt <= now) problems.push("the event has already ended");
  else if (event.startsAt <= now) problems.push("the start time has passed, so move it to a future date");

  const tickets = await prisma.ticketType.findMany({
    where: { eventId: event.id, isActive: true },
    select: { tier: true, endsAt: true },
  });

  if (tickets.length === 0) {
    problems.push("add at least one ticket type");
  } else {
    const sellable = tickets.filter((t) => !(t.tier === "EARLY_BIRD" && t.endsAt && t.endsAt <= now));
    if (sellable.length === 0) problems.push("every ticket type's sales window has already ended");
  }

  return problems;
}

// ---------------------------------------------------------------- seller side

// Sellers send an event for review. Admins publish their own events straight away.
export async function submitEvent(userId: string, role: Role, eventId: string) {
  const event = await getManagedEvent(userId, role, eventId);

  if (event.status === "PENDING_REVIEW") return event; // already waiting
  if (!SUBMITTABLE.includes(event.status)) {
    throw ApiError.badRequest(`A ${words(event.status)} event cannot be submitted for review`);
  }

  const problems = await readinessProblems(event);
  if (problems.length > 0) throw ApiError.badRequest(`Fix these before submitting: ${problems.join("; ")}.`);

  const now = new Date();
  const moved = await prisma.event.updateMany({
    where: { id: eventId, status: { in: SUBMITTABLE } },
    data:
      role === "ADMIN"
        ? { status: "PUBLISHED", submittedAt: now, reviewedAt: now, reviewedById: userId, reviewNote: null }
        : { status: "PENDING_REVIEW", submittedAt: now, reviewedAt: null, reviewedById: null, reviewNote: null },
  });
  if (moved.count === 0) throw ApiError.conflict("The event changed while submitting. Please refresh.");

  return await reload(eventId);
}

// Takes a submitted event back to a draft so it can be edited.
export async function withdrawSubmission(userId: string, role: Role, eventId: string) {
  const event = await getManagedEvent(userId, role, eventId);

  if (event.status === "DRAFT") return event;
  if (event.status !== "PENDING_REVIEW") {
    throw ApiError.badRequest("Only an event that is waiting for review can be withdrawn");
  }

  const moved = await prisma.event.updateMany({
    where: { id: eventId, status: "PENDING_REVIEW" },
    data: { status: "DRAFT", submittedAt: null },
  });
  if (moved.count === 0) throw ApiError.conflict("The event changed while withdrawing. Please refresh.");

  return await reload(eventId);
}

// ----------------------------------------------------------------- admin side

export async function approveEvent(adminId: string, eventId: string) {
  const event = await findEvent(eventId);

  if (event.status === "PUBLISHED") return event;
  if (event.status !== "PENDING_REVIEW") throw ApiError.badRequest("Only an event waiting for review can be approved");
  if (event.seller.status !== "APPROVED") {
    throw ApiError.badRequest("This seller is not approved, so their events cannot go live");
  }

  const problems = await readinessProblems(event);
  if (problems.length > 0) throw ApiError.badRequest(`This event can't go live yet: ${problems.join("; ")}.`);

  const moved = await prisma.event.updateMany({
    where: { id: eventId, status: "PENDING_REVIEW" },
    data: { status: "PUBLISHED", reviewedAt: new Date(), reviewedById: adminId, reviewNote: null },
  });
  if (moved.count === 0) throw ApiError.conflict("The event changed while approving. Please refresh.");

  logger.info(`Event ${eventId} approved by admin ${adminId}`); background(notifyEventReview(eventId, "APPROVED"), "event review email");
  return await reload(eventId);
}

export async function rejectEvent(adminId: string, eventId: string, reason: string) {
  const event = await findEvent(eventId);

  if (event.status === "REJECTED") return event;
  if (event.status !== "PENDING_REVIEW") throw ApiError.badRequest("Only an event waiting for review can be rejected");

  const moved = await prisma.event.updateMany({
    where: { id: eventId, status: "PENDING_REVIEW" },
    data: { status: "REJECTED", reviewNote: reason, reviewedAt: new Date(), reviewedById: adminId },
  });
  if (moved.count === 0) throw ApiError.conflict("The event changed while rejecting. Please refresh.");

  logger.info(`Event ${eventId} rejected by admin ${adminId}`); background(notifyEventReview(eventId, "REJECTED"), "event review email");
  return await reload(eventId);
}

// Pauses a live event. Sales stop and it leaves the public site, but paid orders and issued tickets are untouched.
export async function takeDownEvent(adminId: string, eventId: string, reason: string) {
  const event = await findEvent(eventId);

  if (event.status === "TAKEN_DOWN") return event;
  if (!LIVE.includes(event.status)) throw ApiError.badRequest("Only a live event can be taken down");

  const moved = await prisma.event.updateMany({
    where: { id: eventId, status: { in: LIVE } },
    data: { status: "TAKEN_DOWN", reviewNote: reason, reviewedAt: new Date(), reviewedById: adminId },
  });
  if (moved.count === 0) throw ApiError.conflict("The event changed while taking it down. Please refresh.");

  logger.info(`Event ${eventId} taken down by admin ${adminId}`); background(notifyEventReview(eventId, "TAKEN_DOWN"), "event review email");
  return await reload(eventId);
}

export async function restoreEvent(adminId: string, eventId: string) {
  const event = await findEvent(eventId);

  if (event.status === "PUBLISHED") return event;
  if (event.status !== "TAKEN_DOWN") throw ApiError.badRequest("Only a taken-down event can be restored");
  if (event.seller.status !== "APPROVED") {
    throw ApiError.badRequest("This seller is not approved, so their events cannot go live");
  }
  if (event.endsAt <= new Date()) throw ApiError.badRequest("This event has already ended");

  const moved = await prisma.event.updateMany({
    where: { id: eventId, status: "TAKEN_DOWN" },
    data: { status: "PUBLISHED", reviewNote: null, reviewedAt: new Date(), reviewedById: adminId },
  });
  if (moved.count === 0) throw ApiError.conflict("The event changed while restoring. Please refresh.");

  logger.info(`Event ${eventId} restored by admin ${adminId}`); background(notifyEventReview(eventId, "RESTORED"), "event review email");
  return await reload(eventId);
}

export const countPendingEvents = () => prisma.event.count({ where: { status: "PENDING_REVIEW" } });
// ==========================================
// END OF FILE: backend/src/modules/events/moderation.service.ts
// ==========================================