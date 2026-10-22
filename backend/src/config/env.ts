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

    // Email
    APP_URL: z.string().url().default("http://localhost:5173"), // frontend base URL used in email links
    EMAIL_FROM: z.string().min(3).default("Ticket Take It <onboarding@resend.dev>"),
    RESEND_API_KEY: z.string().optional().transform((v) => v?.trim() || undefined),
    REQUIRE_EMAIL_VERIFICATION: z.enum(["true", "false"]).optional(), // defaults to true in production
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

    if (!v.RESEND_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "Required in production so verification, reset and ticket emails can be sent.",
      });
    }

    if (!v.APP_URL.startsWith("https://")) {
      ctx.addIssue({
        code: "custom",
        path: ["APP_URL"],
        message: "Must be your real https frontend URL in production (it is used in email links).",
      });
    }

    if (/resend\.dev/i.test(v.EMAIL_FROM)) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_FROM"],
        message: "Resend's test sender only delivers to your own address. Verify a domain and use it.",
      });
    }
  });

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const data = parsed.data;

export const env = {
  ...data,
  REFRESH_TOKEN_TTL_MS: durationToMs(data.JWT_REFRESH_EXPIRES),
  // Unverified emails can't buy or sell in production unless you explicitly turn this off.
  REQUIRE_EMAIL_VERIFICATION:
    data.REQUIRE_EMAIL_VERIFICATION !== undefined
      ? data.REQUIRE_EMAIL_VERIFICATION === "true"
      : data.NODE_ENV === "production",
};
// ==========================================
// END OF FILE: backend/src/config/env.ts
// ==========================================