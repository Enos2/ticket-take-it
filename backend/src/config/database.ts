// ==========================================
// FILE: backend/src/config/database.ts
// PURPOSE: Shared PrismaClient instance.
// ==========================================
import { PrismaClient } from "@prisma/client";
import { env } from "./env";

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    // Neon can take a few seconds to wake up. Prisma's default (5s) is too tight
    // for order and payment transactions. Needs Prisma 5.10+; remove if your version rejects it.
    transactionOptions: { maxWait: 10_000, timeout: 20_000 },
  });

if (env.NODE_ENV !== "production") global.prisma = prisma;
// ==========================================
// END OF FILE: backend/src/config/database.ts
// ==========================================