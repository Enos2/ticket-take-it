// ==========================================
// FILE: backend/src/modules/door/offline.rules.ts
// PURPOSE: The pure rules for offline scanning: how a ticket code is hashed for a phone, and what happens to a scan made without internet when it is uploaded.
// ==========================================
import { createHash } from "crypto";
import { TicketTier } from "@prisma/client";

export type OfflineOutcome = "ADMITTED" | "ALREADY_USED" | "UNKNOWN_TICKET" | "WRONG_EVENT" | "TICKET_VOIDED" | "WRONG_GATE";

// A ticket code never goes onto a phone as text. The phone gets this hash instead, and hashes each scanned code to compare.
// Codes are 128 bits of randomness, so a hash cannot be turned back into a code.
export const hashTicketCode = (code: string): string => createHash("sha256").update(code, "utf8").digest("hex");

export interface TicketFacts {
  eventId: string;
  status: "VALID" | "USED" | "VOID";
  tier: TicketTier;
}

export interface GateFacts {
  allowedTiers: TicketTier[];
}

export type Decision = OfflineOutcome | "CLAIM";

// What to do with one uploaded scan. "CLAIM" means: try to mark the ticket as used (it can still lose a race).
export function decideScan(ticket: TicketFacts | null, scanEventId: string, gateGiven: boolean, gate: GateFacts | null): Decision {
  if (!ticket) return "UNKNOWN_TICKET";
  if (ticket.eventId !== scanEventId) return "WRONG_EVENT";

  if (gateGiven) {
    if (!gate) return "WRONG_GATE"; // the gate does not belong to this event
    if (gate.allowedTiers.length > 0 && !gate.allowedTiers.includes(ticket.tier)) return "WRONG_GATE";
  }

  if (ticket.status === "VOID") return "TICKET_VOIDED";
  if (ticket.status === "USED") return "ALREADY_USED";
  return "CLAIM";
}

// A phone's clock can be wrong. The time of a scan is kept inside the last week and never in the future.
export const MAX_SCAN_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function clampScanTime(scannedAt: Date, now: Date): Date {
  const earliest = now.getTime() - MAX_SCAN_AGE_MS;
  return new Date(Math.min(Math.max(scannedAt.getTime(), earliest), now.getTime()));
}

export const OUTCOME_MESSAGE: Record<OfflineOutcome, string> = {
  ADMITTED: "Checked in.",
  ALREADY_USED: "This ticket had already been used when the scan was uploaded.",
  UNKNOWN_TICKET: "This code is not a ticket (it may have been replaced by a transfer or a resale).",
  WRONG_EVENT: "This ticket is for a different event.",
  TICKET_VOIDED: "This ticket was refunded or cancelled after the gate pack was made.",
  WRONG_GATE: "This ticket is not allowed through the gate it was scanned at.",
};
// ==========================================
// END OF FILE: backend/src/modules/door/offline.rules.ts
// ==========================================