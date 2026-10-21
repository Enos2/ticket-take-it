// ==========================================
// FILE: backend/prisma/seed.ts
// PURPOSE: Seeds the database with an Admin user.
// ==========================================
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("AdminPassword123!", 12);
  
  const admin = await prisma.user.upsert({
    where: { email: "admin@tickettakeit.com" },
    update: {},
    create: {
      email: "admin@tickettakeit.com",
      fullName: "System Admin",
      passwordHash,
      role: "ADMIN",
    },
  });

  console.log({ admin });
}

main()
  .catch((e) => {
    console.error(e);
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
// ==========================================
// END OF FILE: backend/prisma/seed.ts
// LOCATION: backend/prisma/seed.ts
// LAST UPDATED: October 21, 2026
// ==========================================