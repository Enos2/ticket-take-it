// ==========================================
// FILE: backend/src/modules/checkin/checkin.schema.ts
// PURPOSE: Validates the scanned ticket code.
// ==========================================
import { z } from "zod";

export const checkInSchema = z.object({
  code: z.string().trim().min(10).max(64),
});

export type CheckInInput = z.infer<typeof checkInSchema>;
// ==========================================
// END OF FILE: backend/src/modules/checkin/checkin.schema.ts
// ==========================================