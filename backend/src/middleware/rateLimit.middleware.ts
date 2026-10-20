// ==========================================
// FILE: backend/src/middleware/rateLimit.middleware.ts
// PURPOSE: Rate limiting protection.
// ==========================================
import rateLimit from "express-rate-limit";

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { success: false, message: "Too many requests, slow down." },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many auth attempts, try again later." },
});
// ==========================================
// END OF FILE: backend/src/middleware/rateLimit.middleware.ts
// LOCATION: backend/src/middleware/rateLimit.middleware.ts
// LAST UPDATED: October 19, 2026
// ==========================================