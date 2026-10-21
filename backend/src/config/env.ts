// ==========================================
// FILE: backend/src/config/env.ts
// PURPOSE: Validates environment variables.
// ==========================================
import * as dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const DURATION_RE = /^(\d+)(s|m|h|d)$/;
const UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

function durationToMs(value: string): number {
  const match = DURATION_RE.exec(value);
  if (!match) throw new Error(`Invalid duration: ${value}`);
  return Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS];
}

const duration = z
  .string()
  .regex(DURATION_RE, 'Use a number plus s, m, h or d, for example "15m" or "7d"');

const SECRET_KEYS = ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "PAYMENT_WEBHOOK_SECRET"] as const;
const PLACEHOLDER_RE = /change-me|super-secret|mock_signature/i;

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    CORS_ORIGIN: z.string().default("http://localhost:5173"),
    DATABASE_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_EXPIRES: duration.default("15m"),
    JWT_REFRESH_EXPIRES: duration.default("7d"),
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
    PAYMENT_WEBHOOK_SECRET: z.string().min(16),
  })
  .superRefine((v, ctx) => {
    if (v.NODE_ENV !== "production") return;

    for (const key of SECRET_KEYS) {
      if (PLACEHOLDER_RE.test(v[key])) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "Placeholder secret detected. Generate a long random value for production.",
        });
      }
    }

    if (v.JWT_ACCESS_SECRET === v.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["JWT_REFRESH_SECRET"],
        message: "Must differ from JWT_ACCESS_SECRET",
      });
    }
  });

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  REFRESH_TOKEN_TTL_MS: durationToMs(parsed.data.JWT_REFRESH_EXPIRES),
};
// ==========================================
// END OF FILE: backend/src/config/env.ts
// ==========================================