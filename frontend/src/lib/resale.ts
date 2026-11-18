// ==========================================
// FILE: frontend/src/lib/resale.ts
// PURPOSE: Types for ticket resale: what buyers see, what sellers manage, and what admins pay out.
// ==========================================
import type { TicketSeat } from "./seating";
import type { TicketTier } from "./types";

export type ResaleListingStatus = "ACTIVE" | "RESERVED" | "SOLD" | "CANCELLED";
export type ResalePayoutStatus = "NONE" | "OWED" | "PAID";

export const LISTING_STATUS_LABEL: Record<ResaleListingStatus, string> = {
  ACTIVE: "For sale",
  RESERVED: "A buyer is paying",
  SOLD: "Sold",
  CANCELLED: "Cancelled",
};

// ---- what a buyer sees on the event page (never who sells it) ----

export interface PublicListing {
  id: string;
  priceCents: number;
  currency: string;
  faceValueCents: number; // what the ticket originally cost
  ticketType: { name: string; tier: TicketTier };
  seat: TicketSeat | null;
}

export interface EventResale {
  enabled: boolean;
  listings: PublicListing[];
}

// The order a buyer pays for after picking a listing.
export interface BoughtListing {
  id: string;
  reference: string;
  status: string;
  totalCents: number;
  currency: string;
  reservationExpiresAt: string | null;
}

// ---- what a seller manages ----

// A ticket I could sell, with the highest price the organiser allows for it.
export interface ResaleOption {
  ticketId: string;
  faceValueCents: number;
  maxPriceCents: number;
  currency: string;
}

export interface MyListing {
  id: string;
  ticketId: string;
  priceCents: number;
  currency: string;
  status: ResaleListingStatus;
  reservedUntil: string | null;
  soldAt: string | null;
  feeCents: number | null; // the platform commission
  netCents: number | null; // what the seller receives
  payoutStatus: ResalePayoutStatus;
  payoutPhone: string;
  ticket: { ticketType: { name: string }; event: { title: string; slug: string } };
}

export interface MyResale {
  listings: MyListing[];
  options: ResaleOption[];
}

export interface CreateListingPayload {
  ticketId: string;
  priceCents: number;
  payoutPhone: string;
}

// ---- organiser settings ----

export interface ResaleSettings {
  enabled: boolean;
  maxPercent: number;
  open: number; // tickets listed right now
  sold: number; // tickets resold so far
}

export interface ResaleSettingsPayload {
  enabled: boolean;
  maxPercent: number;
}

// ---- admin ----

export interface OwedProceeds {
  id: string;
  soldAt: string | null;
  priceCents: number;
  feeCents: number | null;
  netCents: number | null;
  currency: string;
  payoutPhone: string;
  seller: { fullName: string; email: string };
  ticket: { event: { title: string }; ticketType: { name: string } };
}
// ==========================================
// END OF FILE: frontend/src/lib/resale.ts
// ==========================================