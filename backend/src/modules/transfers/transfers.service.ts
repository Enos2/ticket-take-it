// ==========================================
// FILE: backend/src/modules/transfers/transfers.service.ts
// PURPOSE: Moves a ticket from one person to another. The QR code is replaced when the transfer is accepted.
// ==========================================
import { randomBytes } from "crypto";
import { EventStatus, Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { background } from "../../utils/background";
import { notifyTransferAccepted, notifyTransferReceived } from "./transfers.notifications";
import { CreateTransferInput } from "./transfers.schema";

export const TRANSFER_EXPIRY_DAYS = 7;
export const MAX_TRANSFERS_PER_TICKET = 3;
const MAX_PENDING_PER_USER = 25;

// 128 bits of randomness, same as when a ticket is first issued.
const newTicketCode = () => randomBytes(16).toString("base64url");

// What the API returns for a transfer. It never contains a ticket code.
const transferSelect = {
  id: true,
  status: true,
  toEmail: true,
  message: true,
  expiresAt: true,
  createdAt: true,
  from: { select: { fullName: true } },
  ticket: {
    select: {
      id: true,
      ticketType: { select: { name: true } },
      event: { select: { id: true, title: true, slug: true, startsAt: true, endsAt: true, venue: true, city: true } },
    },
  },
} satisfies Prisma.TicketTransferSelect;

// Internal signal: the ticket changed under us (used, refunded, already moved).
class TicketNoLongerAvailable extends Error {}

function isTransferableEvent(event: { status: EventStatus; endsAt: Date }) {
  return (event.status === "PUBLISHED" || event.status === "SOLD_OUT") && event.endsAt > new Date();
}

async function close(transferId: string, status: "EXPIRED" | "CANCELLED") {
  await prisma.ticketTransfer.updateMany({
    where: { id: transferId, status: "PENDING" },
    data: { status, respondedAt: new Date() },
  });
}

// ---------------------------------------------------------------- sending

export async function createTransfer(userId: string, input: CreateTransferInput) {
  const now = new Date();

  const ticket = await prisma.ticket.findFirst({
    where: { id: input.ticketId, userId },
    select: {
      id: true,
      status: true,
      transferCount: true,
      user: { select: { email: true } },
      event: { select: { status: true, endsAt: true } },
    },
  });
  if (!ticket) throw ApiError.notFound("Ticket not found");

  if (input.toEmail === ticket.user.email.toLowerCase()) throw ApiError.badRequest("You cannot transfer a ticket to yourself");
  if (ticket.status === "USED") throw ApiError.badRequest("This ticket was already used");
  if (ticket.status !== "VALID") throw ApiError.badRequest("This ticket is no longer valid");
  if (!isTransferableEvent(ticket.event)) throw ApiError.badRequest("Tickets for this event can no longer be transferred");
  if (ticket.transferCount >= MAX_TRANSFERS_PER_TICKET) {
    throw ApiError.badRequest(`This ticket was already transferred ${MAX_TRANSFERS_PER_TICKET} times, which is the most allowed`);
  }

  const waiting = await prisma.ticketTransfer.count({
    where: { fromUserId: userId, status: "PENDING", expiresAt: { gt: now } },
  });
  if (waiting >= MAX_PENDING_PER_USER) {
    throw ApiError.badRequest("You have too many transfers waiting. Wait for some to be accepted, or cancel them.");
  }

  // An old offer that ran out of time must not block a new one.
  await prisma.ticketTransfer.updateMany({
    where: { ticketId: ticket.id, status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED", respondedAt: now },
  });

  try {
    const transfer = await prisma.ticketTransfer.create({
      data: {
        ticketId: ticket.id,
        fromUserId: userId,
        toEmail: input.toEmail,
        message: input.message ?? null,
        expiresAt: new Date(now.getTime() + TRANSFER_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      },
      select: transferSelect,
    });

    background(notifyTransferReceived(transfer.id), "transfer received email");
    return transfer;
  } catch (err) {
    // The unique index allows only one open transfer per ticket.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw ApiError.conflict("This ticket already has a transfer waiting. Cancel it first to send it to someone else.");
    }
    throw err;
  }
}

// ---------------------------------------------------------------- listing

// Transfers waiting for me to answer, and transfers I sent that are still waiting.
export async function listTransfers(userId: string) {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!me) throw ApiError.unauthorized();

  const now = new Date();

  const [incoming, outgoing] = await Promise.all([
    prisma.ticketTransfer.findMany({
      where: { toEmail: me.email.toLowerCase(), status: "PENDING", expiresAt: { gt: now } },
      select: transferSelect,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.ticketTransfer.findMany({
      where: { fromUserId: userId, status: "PENDING", expiresAt: { gt: now } },
      select: transferSelect,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return { incoming, outgoing };
}

// ---------------------------------------------------------------- answering

export async function acceptTransfer(userId: string, transferId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, emailVerified: true, isActive: true },
  });
  if (!user || !user.isActive) throw ApiError.unauthorized();

  // Anyone could sign up with someone else's email address. Only a verified address can receive tickets.
  if (!user.emailVerified) throw ApiError.forbidden("Verify your email address before accepting tickets");

  // "Missing" and "not yours" look the same, so transfer ids can't be probed.
  const transfer = await prisma.ticketTransfer.findFirst({
    where: { id: transferId, toEmail: user.email.toLowerCase(), status: "PENDING" },
    select: {
      id: true,
      ticketId: true,
      fromUserId: true,
      expiresAt: true,
      ticket: { select: { event: { select: { status: true, endsAt: true } } } },
    },
  });
  if (!transfer) throw ApiError.notFound("Transfer not found");
  if (transfer.fromUserId === user.id) throw ApiError.badRequest("You cannot accept your own transfer");

  const now = new Date();
  if (transfer.expiresAt <= now) {
    await close(transfer.id, "EXPIRED");
    throw ApiError.badRequest("This transfer has expired. Ask the sender to send it again.");
  }
  if (!isTransferableEvent(transfer.ticket.event)) {
    await close(transfer.id, "CANCELLED");
    throw ApiError.badRequest("Tickets for this event can no longer be transferred");
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Only one answer can win: the transfer must still be PENDING.
      const answered = await tx.ticketTransfer.updateMany({
        where: { id: transfer.id, status: "PENDING" },
        data: { status: "ACCEPTED", toUserId: user.id, respondedAt: now },
      });
      if (answered.count === 0) throw ApiError.conflict("This transfer was already answered");

      // The ticket must still belong to the sender and be unused. A new code replaces the old one,
      // so the sender's QR code (or a screenshot of it) stops working.
      const moved = await tx.ticket.updateMany({
        where: {
          id: transfer.ticketId,
          userId: transfer.fromUserId,
          status: "VALID",
          transferCount: { lt: MAX_TRANSFERS_PER_TICKET },
        },
        data: { userId: user.id, code: newTicketCode(), transferCount: { increment: 1 } },
      });
      if (moved.count === 0) throw new TicketNoLongerAvailable();
    });
  } catch (err) {
    if (err instanceof TicketNoLongerAvailable) {
      await close(transfer.id, "CANCELLED");
      throw ApiError.conflict("This ticket is no longer available to transfer. It may have been used or refunded.");
    }
    throw err;
  }

  background(notifyTransferAccepted(transfer.id), "transfer accepted email");
  return { ticketId: transfer.ticketId };
}

export async function declineTransfer(userId: string, transferId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) throw ApiError.unauthorized();

  const declined = await prisma.ticketTransfer.updateMany({
    where: { id: transferId, toEmail: user.email.toLowerCase(), status: "PENDING" },
    data: { status: "DECLINED", respondedAt: new Date() },
  });
  if (declined.count === 0) throw ApiError.notFound("Transfer not found");
}

export async function cancelTransfer(userId: string, transferId: string) {
  const cancelled = await prisma.ticketTransfer.updateMany({
    where: { id: transferId, fromUserId: userId, status: "PENDING" },
    data: { status: "CANCELLED", respondedAt: new Date() },
  });
  if (cancelled.count === 0) throw ApiError.notFound("Transfer not found");
}

// ---------------------------------------------------------------- background job

// Marks offers that ran out of time. Called on a timer from server.ts. Returns how many were closed.
export async function expireTransfers(): Promise<number> {
  const now = new Date();
  const expired = await prisma.ticketTransfer.updateMany({
    where: { status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED", respondedAt: now },
  });
  return expired.count;
}
// ==========================================
// END OF FILE: backend/src/modules/transfers/transfers.service.ts
// ==========================================