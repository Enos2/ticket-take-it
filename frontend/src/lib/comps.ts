// ==========================================
// FILE: frontend/src/lib/comps.ts
// PURPOSE: Types for tickets a seller keeps back and gives out to guests.
// ==========================================
import type { TicketStatus, TicketTier } from "./types";

// How many tickets of one type are kept back for guests.
export interface CompReservation {
  ticketTypeId: string;
  name: string;
  tier: TicketTier;
  isActive: boolean;
  reserved: number; // kept back in total
  givenOut: number; // already given to guests
  remaining: number; // still kept back, ready to give out
}

// Tickets given to one guest in one go.
export interface CompRecord {
  orderId: string;
  reference: string;
  note: string | null;
  createdAt: string;
  recipient: { fullName: string; email: string };
  ticketType: string | null;
  quantity: number;
  tickets: { id: string; status: TicketStatus }[]; // ticket codes are never sent here
}

export interface CompsOverview {
  reservations: CompReservation[];
  comps: CompRecord[];
}

export interface IssueCompPayload {
  ticketTypeId: string;
  quantity: number;
  recipientEmail: string;
  note?: string;
}

export interface IssuedComp {
  orderId: string;
  reference: string;
  eventTitle: string;
  ticketType: string;
  quantity: number;
  recipient: { email: string; fullName: string };
}
// ==========================================
// END OF FILE: frontend/src/lib/comps.ts
// ==========================================