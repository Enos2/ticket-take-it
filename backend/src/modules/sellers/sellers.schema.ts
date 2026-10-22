// ==========================================
// FILE: backend/src/modules/sellers/sellers.schema.ts
// PURPOSE: Validates seller onboarding and dashboard queries.
// ==========================================
import { z } from "zod";
import { paginationSchema } from "../../utils/pagination";

export const onboardSellerSchema = z.object({
  businessName: z.string().trim().min(2).max(100),
  businessEmail: z.string().trim().toLowerCase().email().max(254),
  businessPhone: z
    .string()
    .trim()
    .min(6)
    .max(20)
    .regex(/^\+?[0-9\s-]+$/, "Phone may only contain digits, spaces, dashes and a leading +")
    .optional(),
});

export const sellerOrdersQuerySchema = paginationSchema.extend({
  status: z.enum(["PENDING", "RESERVED", "PAID", "CANCELLED", "REFUNDED", "EXPIRED"]).optional(),
});

export const sellerEventsQuerySchema = paginationSchema.extend({
  status: z.enum(["DRAFT", "PUBLISHED", "SOLD_OUT", "CANCELLED", "COMPLETED"]).optional(),
});

export const attendeesQuerySchema = paginationSchema.extend({
  status: z.enum(["VALID", "USED", "VOID"]).optional(),
});

export const sellerEventParamSchema = z.object({
  eventId: z.string().min(1).max(64),
});

export type OnboardSellerInput = z.infer<typeof onboardSellerSchema>;
export type SellerOrdersQuery = z.infer<typeof sellerOrdersQuerySchema>;
export type SellerEventsQuery = z.infer<typeof sellerEventsQuerySchema>;
export type AttendeesQuery = z.infer<typeof attendeesQuerySchema>;
// ==========================================
// END OF FILE: backend/src/modules/sellers/sellers.schema.ts
// ==========================================