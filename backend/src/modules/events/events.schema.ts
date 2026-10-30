// ==========================================
// FILE: backend/src/modules/events/events.schema.ts
// PURPOSE: Validates event creation, editing and listing data.
// ==========================================
import { z } from "zod";

export const EVENT_CATEGORIES = [
  "MUSIC",
  "NIGHTLIFE",
  "ARTS",
  "SPORTS",
  "CONFERENCE",
  "FOOD",
  "FAMILY",
  "COMMUNITY",
  "OTHER",
] as const;

const httpsUrl = z
  .string()
  .trim()
  .url()
  .max(500)
  .refine((u) => u.startsWith("https://"), { message: "URL must use https" });

const fields = {
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(10).max(5000),
  venue: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(100),
  country: z.string().trim().min(2).max(100),
  startsAt: z.string().datetime({ offset: true }), // ISO 8601
  endsAt: z.string().datetime({ offset: true }),
};

export const createEventSchema = z
  .object({ ...fields, category: z.enum(EVENT_CATEGORIES).default("OTHER"), bannerUrl: httpsUrl.optional() })
  .refine((d) => new Date(d.startsAt) > new Date(), {
    message: "startsAt must be in the future",
    path: ["startsAt"],
  })
  .refine((d) => new Date(d.endsAt) > new Date(d.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

// Every field optional. bannerUrl: null clears the banner.
export const updateEventSchema = z
  .object({ ...fields, category: z.enum(EVENT_CATEGORIES), bannerUrl: httpsUrl.nullable() })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: "Provide at least one field to update" });

export const listEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export const eventSlugParamSchema = z.object({
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/),
});

export const eventIdParamSchema = z.object({
  eventId: z.string().min(1).max(64),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
// ==========================================
// END OF FILE: backend/src/modules/events/events.schema.ts
// ==========================================