// ==========================================
// FILE: backend/src/utils/logger.ts
// PURPOSE: Structured logger.
// ==========================================
import pino from "pino";
import { env } from "../config/env";

export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : env.NODE_ENV === "production" ? "info" : "debug",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'req.headers["x-payment-signature"]',
      'req.headers["x-paystack-signature"]',
      'res.headers["set-cookie"]',
      "password",
      "token",
      "*.password",
      "*.token",
      "*.refreshToken",
      "*.accessToken",
    ],
    remove: true,
  },
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});
// ==========================================
// END OF FILE: backend/src/utils/logger.ts
// ==========================================