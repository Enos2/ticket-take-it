// ==========================================
// FILE: backend/src/modules/events/discovery.schema.ts
// PURPOSE: Validates the search and filter options on the public events list.
// ==========================================
import { z } from "zod";
import { EVENT_CATEGORIES } from "./events.schema";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD");

export const searchEventsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
    q: z.string().trim().max(100).optional(),
    city: z.string().trim().max(100).optional(),
    country: z.string().trim().max(100).optional(),
    category: z.enum(EVENT_CATEGORIES).optional(),
    sellerId: z.string().trim().min(1).max(64).optional(), // only this organiser's events
    from: dateOnly.optional(), // events starting on or after this day (Nairobi time)
    to: dateOnly.optional(), // events starting on or before this day
    free: z.enum(["true", "false"]).optional(),
    maxPriceCents: z.coerce.number().int().min(0).max(100_000_000).optional(),
    sort: z.enum(["soonest", "newest", "popular"]).default("soonest"),
  })
  .refine((d) => !d.from || !d.to || d.from <= d.to, {
    message: "The end date must be on or after the start date",
    path: ["to"],
  });

// "a-b,c-d" becomes ["a-b", "c-d"]. At most 8 events at a time.
export const lookupEventsQuerySchema = z.object({
  slugs: z
    .string()
    .max(1200)
    .transform((value) =>
      value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().max(120).regex(/^[a-z0-9-]+$/, "Invalid event link")).max(8)),
});

export type SearchEventsQuery = z.infer<typeof searchEventsQuerySchema>;
// ==========================================
// END OF FILE: backend/src/modules/events/discovery.schema.ts
// ==========================================