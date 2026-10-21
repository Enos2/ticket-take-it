// ==========================================
// FILE: backend/src/modules/events/events.schema.ts
// PURPOSE: Validates event creation and listing data.
// ==========================================
import { z } from "zod";

export const createEventSchema = z
  .object({
    title: z.string().trim().min(3).max(100),
    description: z.string().trim().min(10).max(5000),
    venue: z.string().trim().min(3).max(200),
    city: z.string().trim().min(2).max(100),
    country: z.string().trim().min(2).max(100),
    startsAt: z.string().datetime({ offset: true }), // ISO 8601
    endsAt: z.string().datetime({ offset: true }),
  })
  .refine((d) => new Date(d.startsAt) > new Date(), {
    message: "startsAt must be in the future",
    path: ["startsAt"],
  })
  .refine((d) => new Date(d.endsAt) > new Date(d.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

export const listEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export const eventSlugParamSchema = z.object({
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
// ==========================================
// END OF FILE: backend/src/modules/events/events.schema.ts
// ==========================================