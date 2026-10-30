// ==========================================
// FILE: frontend/src/lib/seller.ts
// PURPOSE: Labels, helpers and payload types for the seller area.
// ==========================================
import { isEventOver } from "./events";
import type { Tone } from "./orders";
import type { EventStatus, SellerStatus, TicketStatus, TicketTier } from "./types";

// What people see for an event. Past events stay "published" in the database, so this works it out.
export function displayStatus(event: { status: EventStatus; endsAt: string }): { label: string; tone: Tone } {
  switch (event.status) {
    case "CANCELLED":
      return { label: "Cancelled", tone: "brand" };
    case "DRAFT":
      return { label: "Draft", tone: "neutral" };
    case "PENDING_REVIEW":
      return { label: "In review", tone: "gold" };
    case "REJECTED":
      return { label: "Needs changes", tone: "brand" };
    case "TAKEN_DOWN":
      return { label: "Taken down", tone: "brand" };
    default:
      break;
  }

  if (event.status === "COMPLETED" || isEventOver(event)) return { label: "Ended", tone: "neutral" };
  if (event.status === "SOLD_OUT") return { label: "Sold out", tone: "gold" };
  return { label: "On sale", tone: "ok" };
}

// Tickets and details can only change while the event is still ahead of us.
export const canEditEvent = (event: { status: EventStatus; endsAt: string }): boolean =>
  event.status !== "CANCELLED" && event.status !== "COMPLETED" && !isEventOver(event);

export const SELLER_STATUS_LABEL: Record<SellerStatus, string> = {
  PENDING: "Under review",
  APPROVED: "Approved",
  REJECTED: "Not approved",
  SUSPENDED: "Suspended",
};

export const ATTENDEE_STATUS_LABEL: Record<TicketStatus, string> = {
  VALID: "Not yet arrived",
  USED: "Checked in",
  VOID: "Cancelled",
};

export const TIER_HELP: Record<TicketTier, string> = {
  REGULAR: "A standard ticket at one price.",
  EARLY_BIRD: "A discounted price that only sells inside a date window.",
  VIP: "A premium ticket, such as reserved seating or backstage access.",
  VVIP: "The top tier, for example a private area, hospitality and the best view.",
  GROUP: "Sold to groups of a set size, for example 4 to 8 people. Every person gets their own ticket.",
};

// "1,500" or "1500.50" typed in shillings becomes cents. Returns null when it isn't a valid amount.
export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.replace(/[\s,]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

// 150000 cents becomes "1500", and 150050 becomes "1500.50".
export function centsToInput(cents: number): string {
  const major = cents / 100;
  return Number.isInteger(major) ? String(major) : major.toFixed(2);
}

// What the form sends when creating or editing a ticket type. Edits send only what changed.
export interface TicketPayload {
  name?: string;
  description?: string | null;
  tier?: TicketTier;
  priceCents?: number;
  currency?: string;
  quantity?: number;
  startsAt?: string;
  endsAt?: string;
  minGroupSize?: number;
  maxGroupSize?: number;
}
// ==========================================
// END OF FILE: frontend/src/lib/seller.ts
// ==========================================