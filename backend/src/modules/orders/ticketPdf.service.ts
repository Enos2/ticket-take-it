// ==========================================
// FILE: backend/src/modules/orders/ticketPdf.service.ts
// PURPOSE: Finds the tickets a person holds and turns them into a downloadable PDF.
// ==========================================
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { renderTicketsPdf, ticketFileName } from "./ticketPdf";
import type { TicketPdfData } from "./ticketPdf";

const ticketSelect = {
  id: true,
  code: true,
  status: true,
  seat: { select: { row: true, number: true, section: { select: { name: true } } } },
  ticketType: { select: { name: true } },
  event: { select: { title: true, startsAt: true, endsAt: true, venue: true, city: true } },
  order: { select: { reference: true } },
  user: { select: { fullName: true } },
} satisfies Prisma.TicketSelect;

type TicketRow = Prisma.TicketGetPayload<{ select: typeof ticketSelect }>;

function toPdfData(ticket: TicketRow): TicketPdfData {
  return {
    ticketId: ticket.id,
    code: ticket.code,
    eventTitle: ticket.event.title,
    ticketName: ticket.ticketType.name,
    startsAt: ticket.event.startsAt,
    endsAt: ticket.event.endsAt,
    venue: ticket.event.venue,
    city: ticket.event.city,
    seat: ticket.seat ? `${ticket.seat.section.name}, Row ${ticket.seat.row}, Seat ${ticket.seat.number}` : null,
    holderName: ticket.user.fullName,
    orderReference: ticket.order.reference,
  };
}

// One ticket. Only the person who holds it right now can download it.
export async function getTicketPdf(userId: string, ticketId: string) {
  // "Missing" and "not yours" look the same, so ticket ids can't be probed.
  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, userId }, select: ticketSelect });
  if (!ticket) throw ApiError.notFound("Ticket not found");
  if (ticket.status !== "VALID") throw ApiError.badRequest("Only valid tickets can be downloaded");

  return {
    buffer: await renderTicketsPdf([toPdfData(ticket)]),
    fileName: ticketFileName(ticket.event.title, ticket.id),
  };
}

// Every valid ticket of an order that the person still holds, one page each.
// A ticket that was transferred to someone else is not included.
export async function getOrderTicketsPdf(userId: string, orderId: string) {
  const tickets = await prisma.ticket.findMany({
    where: { orderId, userId, status: "VALID" },
    select: ticketSelect,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 100,
  });
  if (tickets.length === 0) throw ApiError.notFound("No tickets to download in this order");

  return {
    buffer: await renderTicketsPdf(tickets.map(toPdfData)),
    fileName: ticketFileName(tickets[0].event.title, tickets[0].id).replace(/\.pdf$/, "-all.pdf"),
  };
}
// ==========================================
// END OF FILE: backend/src/modules/orders/ticketPdf.service.ts
// ==========================================