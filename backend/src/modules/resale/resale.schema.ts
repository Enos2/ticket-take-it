// ==========================================
// FILE: backend/src/modules/resale/resale.schema.ts
// PURPOSE: Validates resale settings, listings and payouts.
// ==========================================
import { z } from "zod";

export const resaleEventParamSchema = z.object({
  eventId: z.string().min(1).max(64),
});

export const resaleListingParamSchema = z.object({
  listingId: z.string().min(1).max(64),
});

// The organiser decides whether tickets of the event can be resold, and the highest price as a share of the original price.
export const resaleSettingsSchema = z.object({
  enabled: z.boolean(),
  maxPercent: z.number().int().min(1).max(200),
});

export const createListingSchema = z.object({
  ticketId: z.string().min(1).max(64),
  priceCents: z.number().int().min(100).max(100_000_000),
  // Where the seller wants the money, as an M-Pesa number. Spaces and dashes are allowed.
  payoutPhone: z
    .string()
    .trim()
    .transform((value) => value.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^\+?\d{9,15}$/, "Enter a valid phone number")),
});

export const markPaidSchema = z.object({
  reference: z.string().trim().max(100).optional(), // for example the M-Pesa receipt
});

export type ResaleSettingsInput = z.infer<typeof resaleSettingsSchema>;
export type CreateListingInput = z.infer<typeof createListingSchema>;
export type MarkPaidInput = z.infer<typeof markPaidSchema>;
// ==========================================
// END OF FILE: backend/src/modules/resale/resale.schema.ts
// ==========================================