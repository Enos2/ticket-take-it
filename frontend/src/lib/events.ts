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
  GROUP: "Group",
};

export const ticketsLeft = (ticket: TicketType) => Math.max(ticket.quantity - ticket.sold, 0);

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

  const open = tickets.filter((t) => ticketsLeft(t) > 0 && saleState(t) !== "ended");
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