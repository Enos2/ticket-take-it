// ==========================================
// FILE: backend/src/modules/auth/auth.schema.ts
// PURPOSE: Defines strict rules for registration and login.
// ==========================================
import { z } from "zod";

// bcrypt silently ignores everything after 72 bytes.
const MAX_PASSWORD_BYTES = 72;

const email = z.string().trim().toLowerCase().email().max(254);

export const registerSchema = z.object({
  email,
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[0-9]/, "Password must contain a number")
    .refine((p) => Buffer.byteLength(p, "utf8") <= MAX_PASSWORD_BYTES, {
      message: `Password must be at most ${MAX_PASSWORD_BYTES} bytes`,
    }),
  fullName: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .min(6)
    .max(20)
    .regex(/^\+?[0-9\s-]+$/, "Phone may only contain digits, spaces, dashes and a leading +")
    .optional(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10).max(256),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
// ==========================================
// END OF FILE: backend/src/modules/auth/auth.schema.ts
// ==========================================