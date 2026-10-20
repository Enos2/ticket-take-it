// ==========================================
// FILE: backend/src/modules/sellers/sellers.schema.ts
// PURPOSE: Validates the data required to become a seller.
// ==========================================
import { z } from "zod";

export const onboardSellerSchema = z.object({
  businessName: z.string().min(2).max(100),
  businessEmail: z.string().email(),
  businessPhone: z.string().min(6).max(20).optional(),
});

export type OnboardSellerInput = z.infer<typeof onboardSellerSchema>;
// ==========================================
// END OF FILE: backend/src/modules/sellers/sellers.schema.ts
// LOCATION: backend/src/modules/sellers/sellers.schema.ts
// LAST UPDATED: October 19, 2026
// ==========================================