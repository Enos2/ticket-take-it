// ==========================================
// FILE: backend/src/modules/checkin/checkin.schema.ts
// PURPOSE: Validates a scan: the ticket code, and optionally the event and gate being scanned for.
// ==========================================
import { z } from "zod";

export const checkInSchema = z.object({
  code: z.string().trim().min(10).max(64),
  eventId: z.string().trim().min(1).max(64).optional(),
  gateId: z.string().trim().min(1).max(64).optional(),
});

export type CheckInInput = z.infer<typeof checkInSchema>;
// ==========================================
// END OF FILE: backend/src/modules/checkin/checkin.schema.ts
// ==========================================