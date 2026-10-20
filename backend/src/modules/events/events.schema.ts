// ==========================================
// FILE: backend/src/modules/events/events.schema.ts
// PURPOSE: Validates event creation data.
// ==========================================
import { z } from "zod";

export const createEventSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().min(10),
  venue: z.string().min(3),
  city: z.string().min(2),
  country: z.string().min(2),
  startsAt: z.string().datetime(), // Expecting ISO string
  endsAt: z.string().datetime(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
// ==========================================
// END OF FILE: backend/src/modules/events/events.schema.ts
// LOCATION: backend/src/modules/events/events.schema.ts
// LAST UPDATED: October 19, 2026
// ==========================================