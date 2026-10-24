// ==========================================
// FILE: backend/src/middleware/rateLimit.middleware.ts
// PURPOSE: Rate limiting protection.
// ==========================================
import rateLimit from "express-rate-limit";
import { env } from "../config/env";

const base = {
  standardHeaders: true, // sends RateLimit-* headers so clients know when to retry
  legacyHeaders: false,
} as const;

// Provider callbacks come from a few IPs and are protected by a secret or signature, so they are never throttled.
const PROVIDER_CALLBACK = /^\/api\/v1\/payments\/callbacks\//;

// Automated tests send hundreds of requests from one address.
const isTest = env.NODE_ENV === "test";

export const generalLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 300,
  skip: (req) => isTest || PROVIDER_CALLBACK.test(req.originalUrl),
  message: { success: false, message: "Too many requests, slow down." },
});

export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: () => isTest,
  message: { success: false, message: "Too many auth attempts, try again later." },
});

// Starting a payment can send a prompt to someone's phone, so it gets its own limit.
export const paymentLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 30,
  skip: () => isTest,
  message: { success: false, message: "Too many payment attempts, please wait a few minutes." },
});
// ==========================================
// END OF FILE: backend/src/middleware/rateLimit.middleware.ts
// ==========================================