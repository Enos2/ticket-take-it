// ==========================================
// FILE: backend/src/modules/seating/seatHolds.ts
// PURPOSE: Holding and releasing seats while an order is being paid, plus small helpers for seat names and states.
// ==========================================
import { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient;

// A seat is in exactly one of these states.
export type SeatStateValue = "available" | "held" | "sold" | "blocked";

export function seatState(
  seat: { isBlocked: boolean; ticketId: string | null; heldByOrderId: string | null; heldUntil: Date | null },
  now: Date
): SeatStateValue {
  if (seat.ticketId) return "sold";
  if (seat.isBlocked) return "blocked";
  if (seat.heldByOrderId && seat.heldUntil && seat.heldUntil > now) return "held";
  return "available";
}

// Holds seats for an order. Each seat is claimed by ONE conditional UPDATE: Postgres re-checks the condition under
// the row lock, so if another buyer got the seat first this matches nothing.
// A hold that ran out of time counts as free. Returns the ids of the seats that could NOT be held.
export async function holdSeats(tx: Db, orderId: string, seatIds: string[], until: Date): Promise<string[]> {
  const now = new Date();
  const failed: string[] = [];

  // Always the same order, so two buyers with overlapping seats can't deadlock.
  for (const seatId of [...seatIds].sort()) {
    const changed = await tx.$executeRaw`
      UPDATE "Seat"
      SET "heldByOrderId" = ${orderId}, "heldUntil" = ${until}
      WHERE "id" = ${seatId}
        AND "isBlocked" = false
        AND "ticketId" IS NULL
        AND ("heldByOrderId" IS NULL OR "heldByOrderId" = ${orderId} OR "heldUntil" IS NULL OR "heldUntil" <= ${now})`;
    if (changed === 0) failed.push(seatId);
  }

  return failed;
}

// Frees the seats an unpaid order was holding (cancelled or expired). Seats with a ticket are never touched.
export async function releaseOrderSeats(tx: Db, orderId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE "Seat"
    SET "heldByOrderId" = NULL, "heldUntil" = NULL
    WHERE "heldByOrderId" = ${orderId} AND "ticketId" IS NULL`;
}

// Row labels: 0 is A, 25 is Z, 26 is AA, and so on.
export function rowLabel(index: number): string {
  let label = "";
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

// Sorts row labels in reading order: A, B, ... Z, AA, AB ...
export const compareRows = (a: string, b: string) => (a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0);
// ==========================================
// END OF FILE: backend/src/modules/seating/seatHolds.ts
// ==========================================