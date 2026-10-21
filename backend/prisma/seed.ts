// ==========================================
// FILE: backend/prisma/seed.ts
// PURPOSE: Seeds the database with an Admin user.
// ==========================================
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

declare const process: {
  env: Record<string, string | undefined>;
};

declare const Buffer: {
  byteLength(value: string, encoding?: string): number;
};

const prisma = new PrismaClient();

// Local development fallbacks only. Production must supply its own values.
const DEV_DEFAULT_EMAIL = "admin@tickettakeit.com";
const DEV_DEFAULT_PASSWORD = "AdminPassword123!";

// Same rules as registration (see auth.schema.ts).
function passwordProblem(password: string): string | null {
  if (password.length < 8) return "must be at least 8 characters";
  if (!/[A-Z]/.test(password)) return "must contain an uppercase letter";
  if (!/[a-z]/.test(password)) return "must contain a lowercase letter";
  if (!/[0-9]/.test(password)) return "must contain a number";
  if (Buffer.byteLength(password, "utf8") > 72) return "must be at most 72 bytes (bcrypt limit)";
  return null;
}

function bcryptRounds(): number {
  const rounds = Number(process.env.BCRYPT_ROUNDS);
  return Number.isInteger(rounds) && rounds >= 10 && rounds <= 15 ? rounds : 12;
}

async function main() {
  const isProd = process.env.NODE_ENV === "production";

  const email = (process.env.SEED_ADMIN_EMAIL ?? (isProd ? "" : DEV_DEFAULT_EMAIL)).trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? (isProd ? "" : DEV_DEFAULT_PASSWORD);
  const fullName = process.env.SEED_ADMIN_NAME?.trim() || "System Admin";

  if (!email || !password) {
    throw new Error("In production, set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD before seeding.");
  }
  if (isProd && password === DEV_DEFAULT_PASSWORD) {
    throw new Error("Refusing to seed production with the default development password.");
  }

  const problem = passwordProblem(password);
  if (problem) throw new Error(`SEED_ADMIN_PASSWORD ${problem}.`);

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });

  if (existing) {
    if (existing.role !== "ADMIN") {
      // Never auto-promote: the existing account's owner may not be you.
      throw new Error(
        `${email} already exists as a ${existing.role} account. Refusing to promote it. ` +
          `Use a different SEED_ADMIN_EMAIL, or change that account's role by hand if you own it.`
      );
    }
    console.log(`Admin ${email} already exists. Nothing to do.`);
    return;
  }

  await prisma.user.create({
    data: {
      email,
      fullName,
      passwordHash: await bcrypt.hash(password, bcryptRounds()),
      role: "ADMIN",
    },
  });

  console.log(`Created admin account: ${email}`);

  if (!isProd && password === DEV_DEFAULT_PASSWORD) {
    console.warn("Using the default development password. Never use it on a deployed database.");
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    throw err;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
// ==========================================
// END OF FILE: backend/prisma/seed.ts
// ==========================================