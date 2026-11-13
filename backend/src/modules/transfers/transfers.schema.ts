// ==========================================
// FILE: backend/src/modules/transfers/transfers.schema.ts
// PURPOSE: Validates ticket transfer requests.
// ==========================================
import { z } from "zod";

export const createTransferSchema = z.object({
  ticketId: z.string().min(1).max(64),
  toEmail: z.string().trim().toLowerCase().email().max(254),
  message: z.string().trim().max(300).optional(),
});

export const transferIdParamSchema = z.object({
  transferId: z.string().min(1).max(64),
});

export type CreateTransferInput = z.infer<typeof createTransferSchema>;
// ==========================================
// END OF FILE: backend/src/modules/transfers/transfers.schema.ts
// ==========================================