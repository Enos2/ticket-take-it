// ==========================================
// FILE: backend/src/modules/payments/payments.schema.ts
// PURPOSE: Validation for starting payments and for the mock webhook.
// ==========================================
import { z } from "zod";

export const paymentOrderParamSchema = z.object({
  orderId: z.string().min(1).max(64),
});

export const initializePaymentSchema = z
  .object({
    provider: z.enum(["MPESA", "MOCK"]), // "CARD" will be added with the card provider
    phone: z.string().trim().min(9).max(20).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.provider === "MPESA" && !d.phone) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: "Phone number is required for M-Pesa" });
    }
  });

// Development-only webhook. The provider is always recorded as MANUAL.
export const mockWebhookSchema = z.object({
  reference: z.string().min(1).max(64),
  status: z.enum(["SUCCEEDED", "FAILED"]),
  providerRef: z.string().min(1).max(200),
  amountCents: z.number().int().positive(),
  currency: z.string().length(3),
});

export type InitializePaymentInput = z.infer<typeof initializePaymentSchema>;
// ==========================================
// END OF FILE: backend/src/modules/payments/payments.schema.ts
// ==========================================