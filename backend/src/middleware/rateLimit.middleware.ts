// ==========================================
// FILE: backend/src/middleware/rateLimit.middleware.ts
// PURPOSE: Rate limiting protection.
// ==========================================
import rateLimit from "express-rate-limit";

const base = {
  standardHeaders: true, // sends RateLimit-* headers so clients know when to retry
  legacyHeaders: false,
} as const;

export const generalLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { success: false, message: "Too many requests, slow down." },
});

export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many auth attempts, try again later." },
});
// ==========================================
// END OF FILE: backend/src/middleware/rateLimit.middleware.ts
// ==========================================