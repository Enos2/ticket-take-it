// New file: backend/src/config/env.ts
// Centralized environment parsing. Fail fast when required configuration is missing.

import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration.");
}

export const env = parsed.data;
