// ==========================================
// FILE: backend/src/config/env.ts
// PURPOSE: Validates environment variables.
// ==========================================
import * as dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("5000"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES: z.string().default("15m"),
  JWT_REFRESH_EXPIRES: z.string().default("7d"),
  BCRYPT_ROUNDS: z.string().default("12"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid env:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  PORT: parseInt(parsed.data.PORT, 10),
  BCRYPT_ROUNDS: parseInt(parsed.data.BCRYPT_ROUNDS, 10),
};
// ==========================================
// END OF FILE: backend/src/config/env.ts
// LOCATION: backend/src/config/env.ts
// LAST UPDATED: October 19, 2026
// ==========================================