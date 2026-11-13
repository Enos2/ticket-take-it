// ==========================================
// FILE: frontend/src/lib/events.ts
// PURPOSE: Helpers for showing events and their tickets.
// ==========================================
import { formatMoney } from "./format";
import type { EventSummary, TicketTier, TicketType } from "./types";

export const TIER_LABEL: Record<TicketTier, string> = {
  EARLY_BIRD: "Early bird",
  REGULAR: "Regular",
  VIP: "VIP",
  VVIP: "VVIP",
  GROUP: "Group",
};

// Tickets kept off public sale for the seller to give out, and not given out yet.
export const heldForGuests = (ticket: Pick<TicketType, "hostReserved" | "hostIssued">) =>
  Math.max(ticket.hostReserved - ticket.hostIssued, 0);

// What the public can still buy of one ticket type.
export const ticketsLeft = (ticket: TicketType) => Math.max(ticket.quantity - ticket.sold - heldForGuests(ticket), 0);

// Spots the whole event can still take, with every ticket type counted together.
// Infinity when the event has no capacity limit. The server makes the final decision.
export function eventRoom(event: Pick<EventSummary, "maxCapacity" | "ticketTypes">): number {
  if (event.maxCapacity === null) return Infinity;
  const committed = event.ticketTypes.reduce((sum, t) => sum + t.sold + heldForGuests(t), 0);
  return Math.max(event.maxCapacity - committed, 0);
}

// What a visitor can buy right now of one ticket type: stock, event capacity and sold-out status together.
export function availableNow(event: Pick<EventSummary, "status" | "maxCapacity" | "ticketTypes">, ticket: TicketType): number {
  if (event.status === "SOLD_OUT") return 0;
  return Math.min(ticketsLeft(ticket), eventRoom(event));
}

export const isEventOver = (event: { endsAt: string }) => new Date(event.endsAt).getTime() < Date.now();

// Early bird tickets only sell inside their window. Everything else is always open.
export function saleState(ticket: TicketType): "open" | "upcoming" | "ended" {
  if (ticket.tier !== "EARLY_BIRD") return "open";
  const now = Date.now();
  if (ticket.startsAt && new Date(ticket.startsAt).getTime() > now) return "upcoming";
  if (ticket.endsAt && new Date(ticket.endsAt).getTime() < now) return "ended";
  return "open";
}

// What to show on an event card: the starting price, or why it can't be bought.
export function eventPricing(event: EventSummary): { label: string; soldOut: boolean } {
  const tickets = event.ticketTypes.filter((t) => t.isActive);
  if (tickets.length === 0) return { label: "Tickets soon", soldOut: false };

  const open = tickets.filter((t) => availableNow(event, t) > 0 && saleState(t) !== "ended");
  if (open.length === 0) return { label: "Sold out", soldOut: true };

  const cheapest = open.reduce((a, b) => (b.priceCents < a.priceCents ? b : a));
  return {
    label: cheapest.priceCents === 0 ? "Free" : `From ${formatMoney(cheapest.priceCents, cheapest.currency)}`,
    soldOut: false,
  };
}
// ==========================================
// END OF FILE: frontend/src/lib/events.ts
// ==========================================