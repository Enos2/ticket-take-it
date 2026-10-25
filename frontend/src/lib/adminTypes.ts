// ==========================================
// FILE: frontend/src/lib/adminTypes.ts
// PURPOSE: Types for what the admin API returns.
// ==========================================
import type { EventStatus, OrderStatus, PaymentStatusValue, Role, SellerStatus } from "./types";

export interface AdminStats {
  users: number;
  pendingSellers: number;
  events: number;
  publishedEvents: number;
  paidOrders: number;
  ticketsIssued: number;
  paymentsNeedingRefund: number;
  revenue: { currency: string; totalCents: number }[]; // one entry per currency, in cents
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

export interface AdminSeller {
  id: string;
  userId: string;
  businessName: string;
  businessEmail: string;
  businessPhone: string | null;
  status: SellerStatus;
  approvedAt: string | null;
  createdAt: string;
  user: { email: string; fullName: string };
}

export interface AdminEvent {
  id: string;
  slug: string;
  title: string;
  venue: string;
  city: string;
  startsAt: string;
  endsAt: string;
  status: EventStatus;
  createdAt: string;
  seller: { id: string; businessName: string; status: SellerStatus };
  ticketTypes: { quantity: number; sold: number }[];
}

export interface AdminOrder {
  id: string;
  reference: string;
  status: OrderStatus;
  totalCents: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  user: { email: string; fullName: string };
  items: {
    quantity: number;
    subtotalCents: number;
    ticketType: { name: string; event: { id: string; title: string } };
  }[];
  _count: { tickets: number };
}

export type PaymentProviderName = "PAYSTACK" | "MPESA" | "STRIPE" | "MANUAL";

// One payment that needs money returned to a customer.
export interface RefundQueueItem {
  id: string;
  orderId: string;
  provider: PaymentProviderName;
  providerRef: string | null;
  status: PaymentStatusValue;
  amountCents: number;
  currency: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  order: {
    reference: string;
    status: OrderStatus;
    user: { email: string; fullName: string; phone: string | null };
  };
}

export interface RefundAttempt {
  paymentId: string;
  provider: PaymentProviderName;
  providerRef: string | null;
  amountCents: number;
  currency: string;
  outcome: "refunded" | "manual_required" | "failed";
  detail: string | null;
}

export interface RefundOrderResult {
  orderId: string;
  reference: string;
  status: "REFUNDED";
  manualRefundRequired: boolean;
  payments: RefundAttempt[];
}

export interface BulkRefundResult {
  refunded: number;
  failed: { reference: string; error: string }[];
  remaining: number;
  needsReview: number;
}

export interface CancelEventResult {
  event: { id: string; title: string };
  paidOrdersToRefund: number;
}
// ==========================================
// END OF FILE: frontend/src/lib/adminTypes.ts
// ==========================================