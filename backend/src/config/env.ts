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

// Blank values in .env (KEY=) count as "not set".
const optionalString = z
  .string()
  .optional()
  .transform((v) => v?.trim() || undefined);

const PLACEHOLDER_RE = /change-me|super-secret|mock_signature/i;
const URL_SAFE_RE = /^[A-Za-z0-9_-]+$/;

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

    // Email
    APP_URL: z.string().url().default("http://localhost:5173"), // frontend base URL used in email links
    EMAIL_FROM: z.string().min(3).default("Ticket Take It <onboarding@resend.dev>"),
    RESEND_API_KEY: optionalString,
    REQUIRE_EMAIL_VERIFICATION: z.enum(["true", "false"]).optional(), // defaults to true in production

    // Mock payments (development testing only)
    PAYMENT_WEBHOOK_SECRET: optionalString,
    ENABLE_MOCK_PAYMENTS: z.enum(["true", "false"]).optional(), // defaults to on in development, off in production

    // Public https address of THIS API. Safaricom calls back to it, so localhost won't work (use a tunnel).
    PUBLIC_API_URL: optionalString,

    // M-Pesa (Safaricom Daraja). Leave all blank to disable.
    MPESA_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
    MPESA_CONSUMER_KEY: optionalString,
    MPESA_CONSUMER_SECRET: optionalString,
    MPESA_SHORTCODE: optionalString,
    MPESA_PASSKEY: optionalString,
    MPESA_TILL_NUMBER: optionalString, // only for Buy Goods tills
    MPESA_TRANSACTION_TYPE: z.enum(["CustomerPayBillOnline", "CustomerBuyGoodsOnline"]).default("CustomerPayBillOnline"),
    MPESA_CALLBACK_SECRET: optionalString,
  })
  .superRefine((v, ctx) => {
    const add = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });

    // ---- mock payments ----
    if (v.PAYMENT_WEBHOOK_SECRET && v.PAYMENT_WEBHOOK_SECRET.length < 16) {
      add("PAYMENT_WEBHOOK_SECRET", "Must be at least 16 characters");
    }
    if (v.ENABLE_MOCK_PAYMENTS === "true" && !v.PAYMENT_WEBHOOK_SECRET) {
      add("PAYMENT_WEBHOOK_SECRET", "Required when ENABLE_MOCK_PAYMENTS is true");
    }

    // ---- M-Pesa: all or nothing ----
    const required = {
      MPESA_CONSUMER_KEY: v.MPESA_CONSUMER_KEY,
      MPESA_CONSUMER_SECRET: v.MPESA_CONSUMER_SECRET,
      MPESA_SHORTCODE: v.MPESA_SHORTCODE,
      MPESA_PASSKEY: v.MPESA_PASSKEY,
      MPESA_CALLBACK_SECRET: v.MPESA_CALLBACK_SECRET,
    };
    if (Object.values(required).some(Boolean)) {
      for (const [name, value] of Object.entries(required)) {
        if (!value) add(name, "Required when M-Pesa is configured");
      }
      if (v.MPESA_CALLBACK_SECRET && (v.MPESA_CALLBACK_SECRET.length < 24 || !URL_SAFE_RE.test(v.MPESA_CALLBACK_SECRET))) {
        add("MPESA_CALLBACK_SECRET", "Use at least 24 letters, digits, dashes or underscores (it goes in a URL)");
      }
      if (!v.PUBLIC_API_URL) {
        add("PUBLIC_API_URL", "Required when M-Pesa is configured (Safaricom must reach your callback)");
      } else {
        try {
          const url = new URL(v.PUBLIC_API_URL);
          if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("bad protocol");
        } catch {
          add("PUBLIC_API_URL", "Must be a full URL such as https://api.example.com");
        }
      }
    }

    if (v.NODE_ENV !== "production") return;

    // ---- production only ----
    const secrets: Record<string, string | undefined> = {
      JWT_ACCESS_SECRET: v.JWT_ACCESS_SECRET,
      JWT_REFRESH_SECRET: v.JWT_REFRESH_SECRET,
      PAYMENT_WEBHOOK_SECRET: v.PAYMENT_WEBHOOK_SECRET,
      MPESA_CALLBACK_SECRET: v.MPESA_CALLBACK_SECRET,
    };
    for (const [key, value] of Object.entries(secrets)) {
      if (value && PLACEHOLDER_RE.test(value)) {
        add(key, "Placeholder secret detected. Generate a long random value for production.");
      }
    }

    if (v.JWT_ACCESS_SECRET === v.JWT_REFRESH_SECRET) {
      add("JWT_REFRESH_SECRET", "Must differ from JWT_ACCESS_SECRET");
    }
    if (!v.RESEND_API_KEY) {
      add("RESEND_API_KEY", "Required in production so verification, reset and ticket emails can be sent.");
    }
    if (!v.APP_URL.startsWith("https://")) {
      add("APP_URL", "Must be your real https frontend URL in production (it is used in email links).");
    }
    if (/resend\.dev/i.test(v.EMAIL_FROM)) {
      add("EMAIL_FROM", "Resend's test sender only delivers to your own address. Verify a domain and use it.");
    }
  });

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const data = parsed.data;

const mpesa =
  data.MPESA_CONSUMER_KEY && data.MPESA_CONSUMER_SECRET && data.MPESA_SHORTCODE && data.MPESA_PASSKEY && data.MPESA_CALLBACK_SECRET
    ? {
        env: data.MPESA_ENV,
        consumerKey: data.MPESA_CONSUMER_KEY,
        consumerSecret: data.MPESA_CONSUMER_SECRET,
        shortcode: data.MPESA_SHORTCODE,
        passkey: data.MPESA_PASSKEY,
        tillNumber: data.MPESA_TILL_NUMBER,
        transactionType: data.MPESA_TRANSACTION_TYPE,
        callbackSecret: data.MPESA_CALLBACK_SECRET,
      }
    : null;

const mockEnabled = data.ENABLE_MOCK_PAYMENTS
  ? data.ENABLE_MOCK_PAYMENTS === "true"
  : data.NODE_ENV !== "production" && Boolean(data.PAYMENT_WEBHOOK_SECRET);

if (data.NODE_ENV === "production") {
  if (!mpesa) console.warn("[config] No payment provider is configured. Paid orders cannot be completed.");
  if (mpesa?.env === "sandbox") console.warn("[config] M-Pesa is in SANDBOX mode in production. No real money will move.");
  if (mockEnabled) console.warn("[config] Mock payments are ENABLED in production. Anyone holding PAYMENT_WEBHOOK_SECRET can mark orders paid.");
}

export const env = {
  ...data,
  PUBLIC_API_URL: data.PUBLIC_API_URL?.replace(/\/+$/, ""),
  REFRESH_TOKEN_TTL_MS: durationToMs(data.JWT_REFRESH_EXPIRES),
  // Unverified emails can't buy or sell in production unless you explicitly turn this off.
  REQUIRE_EMAIL_VERIFICATION:
    data.REQUIRE_EMAIL_VERIFICATION !== undefined
      ? data.REQUIRE_EMAIL_VERIFICATION === "true"
      : data.NODE_ENV === "production",
  ENABLE_MOCK_PAYMENTS: mockEnabled,
  mpesa, // null when M-Pesa is not configured
};
// ==========================================
// END OF FILE: backend/src/config/env.ts
// ==========================================