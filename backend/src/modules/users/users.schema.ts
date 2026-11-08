// ==========================================
// FILE: backend/src/modules/users/users.schema.ts
// PURPOSE: Validation for editing a profile and for deleting an account.
// ==========================================
import { z } from "zod";

export const updateProfileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    // null clears the phone number
    phone: z
      .string()
      .trim()
      .min(6)
      .max(20)
      .regex(/^\+?[0-9\s-]+$/, "Phone may only contain digits, spaces, dashes and a leading +")
      .nullable()
      .optional(),
  })
  .refine((d) => d.fullName !== undefined || d.phone !== undefined, { message: "Provide a name or a phone number" });

export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(128),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
// ==========================================
// END OF FILE: backend/src/modules/users/users.schema.ts
// ==========================================