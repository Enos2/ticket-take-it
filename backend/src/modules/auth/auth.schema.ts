// ==========================================
// FILE: backend/src/modules/auth/auth.schema.ts
// PURPOSE: Defines strict rules for registration and login.
// ==========================================
import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/),
  fullName: z.string().min(2).max(120),
  phone: z.string().min(6).max(20).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});
// ==========================================
// END OF FILE: backend/src/modules/auth/auth.schema.ts
// LOCATION: backend/src/modules/auth/auth.schema.ts
// LAST UPDATED: October 19, 2026
// ==========================================