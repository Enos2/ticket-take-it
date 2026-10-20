// ==========================================
// FILE: backend/src/modules/tickets/tickets.schema.ts
// PURPOSE: Defines validation rules for Early Bird and Group tickets.
// ==========================================
import { z } from "zod";

export const createTicketTypeSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  tier: z.enum(["EARLY_BIRD", "REGULAR", "VIP", "GROUP"]),
  priceCents: z.number().int().positive(),
  quantity: z.number().int().positive(),
  
  // Early Bird specific fields (optional, but required if tier is EARLY_BIRD)
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),

  // Group ticket specific fields (required if tier is GROUP)
  isGroup: z.boolean().default(false),
  minGroupSize: z.number().int().positive().optional(),
  maxGroupSize: z.number().int().positive().optional(),
}).refine((data) => {
  // Validation: If it's a group ticket, min and max must be provided
  if (data.tier === "GROUP" || data.isGroup) {
    return !!data.minGroupSize && !!data.maxGroupSize && data.maxGroupSize >= data.minGroupSize;
  }
  return true;
}, {
  message: "Group tickets require valid minGroupSize and maxGroupSize.",
  path: ["isGroup"],
}).refine((data) => {
  // Validation: If it's early bird, start and end dates must be provided
  if (data.tier === "EARLY_BIRD") {
    return !!data.startsAt && !!data.endsAt;
  }
  return true;
}, {
  message: "Early Bird tickets require startsAt and endsAt dates.",
  path: ["tier"],
});

export type CreateTicketTypeInput = z.infer<typeof createTicketTypeSchema>;
// ==========================================
// END OF FILE: backend/src/modules/tickets/tickets.schema.ts
// LOCATION: backend/src/modules/tickets/tickets.schema.ts
// LAST UPDATED: October 19, 2026
// ==========================================