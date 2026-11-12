// ==========================================
// FILE: backend/src/modules/events/comps.schema.ts
// PURPOSE: Validates giving out and revoking complimentary tickets.
// ==========================================
import { z } from "zod";

export const issueCompSchema = z.object({
  ticketTypeId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(200),
  recipientEmail: z.string().trim().toLowerCase().email().max(254),
  note: z.string().trim().max(200).optional(),
});

export const compEventParamSchema = z.object({
  eventId: z.string().min(1).max(64),
});

export const compTicketParamSchema = z.object({
  eventId: z.string().min(1).max(64),
  ticketId: z.string().min(1).max(64),
});

export type IssueCompInput = z.infer<typeof issueCompSchema>;
// ==========================================
// END OF FILE: backend/src/modules/events/comps.schema.ts
// ==========================================