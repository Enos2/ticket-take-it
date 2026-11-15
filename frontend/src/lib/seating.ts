// ==========================================
// FILE: frontend/src/lib/seating.ts
// PURPOSE: Types and helpers for seat maps, seat layouts and seats on tickets.
// ==========================================
import type { OrderTicket, TicketTier } from "./types";

// What a buyer sees: a seat can be chosen, is held by someone paying, or is taken.
export type PublicSeatState = "available" | "held" | "taken";
// What the seller sees: the same, plus seats kept for guests and seats already given to a guest.
export type SellerSeatState = "available" | "held" | "sold" | "blocked" | "given";

export interface SeatTicketType {
  id: string;
  name: string;
  tier: TicketTier;
  priceCents: number;
  currency: string;
  isActive: boolean;
}

export interface MapSeat<S extends string> {
  id: string;
  number: number;
  state: S;
}

export interface MapRow<S extends string> {
  row: string;
  seats: MapSeat<S>[];
}

export interface MapSection<S extends string> {
  id: string;
  name: string;
  ticketType: SeatTicketType; // every seat in the section is sold at this ticket type's price
  rows: MapRow<S>[];
}

export interface SeatMapData<S extends string> {
  eventId: string;
  sections: MapSection<S>[];
}

export type PublicSeatMap = SeatMapData<PublicSeatState>;
export type SellerSeatMap = SeatMapData<SellerSeatState>;

// The seat a ticket sits in.
export interface TicketSeat {
  row: string;
  number: number;
  section: { name: string };
}

export type SeatedOrderTicket = OrderTicket & { seat: TicketSeat | null };

export const seatLabel = (seat: TicketSeat) => `${seat.section.name} · Row ${seat.row} · Seat ${seat.number}`;

// How many seats one person can pick at a time.
export const MAX_SEATS_PER_ORDER = 10;

// ---- seller requests ----

export interface LayoutSectionInput {
  name: string;
  ticketTypeId: string;
  rows: number;
  seatsPerRow: number;
}

export interface SaveLayoutPayload {
  sections: LayoutSectionInput[];
}

export interface BlockSeatsPayload {
  seatIds: string[];
  blocked: boolean; // true keeps the seats for guests, false puts them back on sale
}

export interface GiveSeatsPayload {
  seatIds: string[];
  recipientEmail: string;
  note?: string;
}

export interface GivenSeats {
  orderId: string;
  reference: string;
  seats: number;
  recipient: { email: string; fullName: string };
}
// ==========================================
// END OF FILE: frontend/src/lib/seating.ts
// ==========================================