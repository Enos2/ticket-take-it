// ==========================================
// FILE: backend/src/modules/sellers/sellers.schema.ts
// PURPOSE: Validates the data required to become a seller and to list seller orders.
// ==========================================
import { z } from "zod";

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

export const sellerOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["PENDING", "RESERVED", "PAID", "CANCELLED", "REFUNDED", "EXPIRED"]).optional(),
});

export type OnboardSellerInput = z.infer<typeof onboardSellerSchema>;
export type SellerOrdersQuery = z.infer<typeof sellerOrdersQuerySchema>;
// ==========================================
// END OF FILE: backend/src/modules/sellers/sellers.schema.ts
// ==========================================