// ==========================================
// FILE: frontend/src/lib/types.ts
// PURPOSE: Types for what the API returns.
// ==========================================
export type Role = "USER" | "SELLER" | "ADMIN";
export type SellerStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
export type EventStatus = "DRAFT" | "PUBLISHED" | "SOLD_OUT" | "CANCELLED" | "COMPLETED";
export type TicketTier = "EARLY_BIRD" | "REGULAR" | "VIP" | "GROUP";
export type OrderStatus = "PENDING" | "RESERVED" | "PAID" | "CANCELLED" | "REFUNDED" | "EXPIRED";
export type TicketStatus = "VALID" | "USED" | "VOID";
export type PaymentStatusValue = "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";

export interface SellerSummary {
  id: string;
  businessName: string;
  status: SellerStatus;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  emailVerified: boolean;
  createdAt: string;
  sellerProfile: SellerSummary | null;
}

export interface AuthResult {
  user: { id: string; email: string; fullName: string; role: Role; emailVerified: boolean };
  accessToken: string;
  refreshToken: string;
}

export interface TicketType {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  tier: TicketTier;
  priceCents: number; // amounts are always in cents
  currency: string;
  quantity: number;
  sold: number; // includes tickets held by unpaid orders
  startsAt: string | null; // early bird window
  endsAt: string | null;
  isGroup: boolean;
  minGroupSize: number | null;
  maxGroupSize: number | null;
  isActive: boolean;
}

// The few event fields shown next to an order or a ticket.
export interface EventBrief {
  id: string;
  title: string;
  slug: string;
  venue: string;
  city: string;
  startsAt: string;
  endsAt: string;
  status: EventStatus;
}

export interface EventSummary extends EventBrief {
  description: string;
  country: string;
  bannerUrl: string | null;
  ticketTypes: TicketType[];
}

export interface PageMeta {
  total: number;
  page: number;
  limit: number;
}

export interface Page<T> {
  items: T[];
  meta: PageMeta;
}

// ---- orders and tickets ----

export interface OrderItem {
  id: string;
  ticketTypeId: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
  ticketType: TicketType & { event?: EventBrief };
}

export interface OrderTicket {
  id: string;
  code: string; // the secret inside the QR code
  status: TicketStatus;
  ticketTypeId: string;
}

export interface Order {
  id: string;
  reference: string;
  status: OrderStatus;
  totalCents: number;
  currency: string;
  reservationExpiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
  items: OrderItem[];
  tickets: OrderTicket[];
}

export interface MyTicket {
  id: string;
  code: string;
  status: TicketStatus;
  usedAt: string | null;
  createdAt: string;
  ticketType: { name: string; tier: TicketTier };
  event: EventBrief;
  order: { reference: string };
}

// ---- payments ----

export interface PaymentMethods {
  paystack: boolean;
  mpesa: boolean;
  mock: boolean;
}

export interface InitializedPaystack {
  provider: "PAYSTACK";
  authorizationUrl: string;
}

export interface InitializedMpesa {
  provider: "MPESA";
  checkoutRequestId: string;
  message: string;
}

export type InitializedPayment = InitializedPaystack | InitializedMpesa;

export interface PaymentProgress {
  reference: string;
  orderStatus: OrderStatus;
  paid: boolean;
  paymentStatus: PaymentStatusValue | null;
  failureReason: string | null;
  expiresAt: string | null;
}

// ---- seller area ----

export interface SellerProfile {
  id: string;
  businessName: string;
  businessEmail: string;
  businessPhone: string | null;
  status: SellerStatus;
  approvedAt: string | null;
  createdAt: string;
}

export type SellerTicketBrief = Pick<
  TicketType,
  "id" | "name" | "tier" | "priceCents" | "currency" | "quantity" | "sold" | "isActive"
>;

// One row of the seller's events list.
export interface SellerEventListItem extends EventBrief {
  description: string;
  country: string;
  bannerUrl: string | null;
  ticketTypes: SellerTicketBrief[];
}

// One event with every ticket type field, for the seller who owns it.
export type SellerEvent = EventSummary;

export interface SalesTicketRow extends SellerTicketBrief {
  available: number; // excludes tickets held by unpaid orders
  paidQuantity: number;
  revenueCents: number;
}

export interface EventSalesSummary {
  event: { id: string; title: string; slug: string; status: EventStatus; startsAt: string; endsAt: string };
  ticketTypes: SalesTicketRow[];
  totals: {
    ticketsIssued: number;
    checkedIn: number;
    notYetArrived: number;
    revenueCents: number;
    currency: string | null;
  };
}

export interface Attendee {
  id: string;
  status: TicketStatus;
  usedAt: string | null;
  createdAt: string;
  ticketType: { name: string };
  user: { fullName: string; email: string };
  order: { reference: string };
}

export interface CheckInResult {
  ticketId: string;
  event: string;
  ticketType: string;
  holder: string;
  checkedInAt: string;
}
// ==========================================
// END OF FILE: frontend/src/lib/types.ts
// ==========================================