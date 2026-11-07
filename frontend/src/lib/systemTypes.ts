// ==========================================
// FILE: frontend/src/lib/systemTypes.ts
// PURPOSE: Types for system health, the audit log and receipts.
// ==========================================
import type { OrderStatus } from "./types";

export interface JobStatus {
  name: string;
  intervalMs: number;
  running: boolean;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastDurationMs: number | null;
  lastItems: number | null;
  lastError: string | null;
  runs: number;
  failures: number;
  stale: boolean; // looks stuck
}

export interface EmailFailure {
  id: string;
  toEmail: string;
  subject: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
}

export interface EmailStats {
  configured: boolean;
  pending: number;
  sent24h: number;
  failed7d: number;
  oldestPendingMinutes: number | null;
  recentFailures: EmailFailure[];
}

export interface SystemHealth {
  server: { uptimeSeconds: number; environment: string; nodeVersion: string };
  database: { ok: boolean; latencyMs: number };
  jobs: JobStatus[];
  email: EmailStats | null;
  services: { paystack: boolean; mpesa: boolean; email: boolean; monitoring: boolean };
}

export interface AuditRow {
  id: string;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  summary: string;
  ip: string | null;
  createdAt: string;
}

export interface ReceiptLine {
  eventTitle: string;
  eventStartsAt: string;
  venue: string;
  city: string;
  organizer: string;
  ticketName: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
}

export interface ReceiptData {
  reference: string;
  status: OrderStatus;
  currency: string;
  totalCents: number;
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
  buyer: { fullName: string; email: string };
  lines: ReceiptLine[];
  payments: { method: "PAYSTACK" | "MPESA" | "STRIPE" | "MANUAL"; reference: string | null; amountCents: number; currency: string }[];
}
// ==========================================
// END OF FILE: frontend/src/lib/systemTypes.ts
// ==========================================