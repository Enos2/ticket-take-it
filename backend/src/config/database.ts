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
  });

if (env.NODE_ENV !== "production") global.prisma = prisma;
// ==========================================
// END OF FILE: backend/src/config/database.ts
// LOCATION: backend/src/config/database.ts
// LAST UPDATED: October 19, 2026
// ==========================================