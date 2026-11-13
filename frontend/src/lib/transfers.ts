// ==========================================
// FILE: frontend/src/lib/transfers.ts
// PURPOSE: Types and rules for sending tickets to other people.
// ==========================================
import type { EventBrief, MyTicket } from "./types";

// Mirrors the server rule. The server always has the final say.
export const MAX_TRANSFERS_PER_TICKET = 3;

// A ticket as listed in My tickets, with how many times it already changed hands.
export type TransferableTicket = MyTicket & { transferCount: number };

export interface TransferView {
  id: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED";
  toEmail: string;
  message: string | null;
  expiresAt: string;
  createdAt: string;
  from: { fullName: string };
  ticket: {
    id: string;
    ticketType: { name: string };
    event: Pick<EventBrief, "id" | "title" | "slug" | "startsAt" | "endsAt" | "venue" | "city">;
  };
}

export interface TransfersOverview {
  incoming: TransferView[]; // waiting for me to accept or decline
  outgoing: TransferView[]; // tickets I sent that are still waiting
}

export interface CreateTransferPayload {
  ticketId: string;
  toEmail: string;
  message?: string;
}

// Whether the Transfer button is offered for a ticket.
export function canTransfer(ticket: TransferableTicket): boolean {
  const live = ticket.event.status === "PUBLISHED" || ticket.event.status === "SOLD_OUT";
  return (
    ticket.status === "VALID" &&
    live &&
    new Date(ticket.event.endsAt).getTime() > Date.now() &&
    ticket.transferCount < MAX_TRANSFERS_PER_TICKET
  );
}
// ==========================================
// END OF FILE: frontend/src/lib/transfers.ts
// ==========================================