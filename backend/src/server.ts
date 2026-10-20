// ==========================================
// FILE: backend/src/server.ts
// PURPOSE: Starts the server.
// ==========================================
import app from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { prisma } from "./config/database";

const server = app.listen(env.PORT, () => {
  logger.info(`🚀 Ticket Take It API running on http://localhost:${env.PORT}`);
});

process.on("SIGINT", async () => {
  logger.info("Shutting down...");
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
});
// ==========================================
// END OF FILE: backend/src/server.ts
// LOCATION: backend/src/server.ts
// LAST UPDATED: October 19, 2026
// ==========================================