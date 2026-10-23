// ==========================================
// FILE: backend/src/server.ts
// PURPOSE: Starts the server and background jobs.
// ==========================================
import app from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { prisma } from "./config/database";
import { releaseExpiredOrders } from "./modules/orders/orders.service";
import { cleanupExpiredRefreshTokens } from "./modules/auth/auth.service";
import { reconcilePayments } from "./modules/payments/payments.jobs";

const server = app.listen(env.PORT, () => {
  logger.info(`Ticket Take It API running on http://localhost:${env.PORT}`);
});

// Load balancers keep idle connections open for about 60s. Node's default is 5s,
// which causes random 502s. Keep Node's timeouts longer than the proxy's.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

// ---- Background jobs ----
// Each job skips a tick if its previous run is still going.
function startJob(name: string, intervalMs: number, job: () => Promise<number>) {
  let running = false;

  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const count = await job();
      if (count > 0) logger.info(`${name}: ${count} item(s)`);
    } catch (err) {
      logger.error({ err }, `${name} failed`);
    } finally {
      running = false;
    }
  }, intervalMs);

  timer.unref(); // don't keep the process alive just for a timer
  return timer;
}

const timers = [
  startJob("releaseExpiredOrders", 60_000, releaseExpiredOrders), // every minute
  startJob("reconcilePayments", 60_000, reconcilePayments), // every minute
  startJob("cleanupExpiredTokens", 60 * 60_000, cleanupExpiredRefreshTokens), // every hour
];

// ---- Graceful shutdown ----
let shuttingDown = false;

function shutdown(signal: string, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received. Shutting down...`);

  timers.forEach(clearInterval);

  // Force exit if connections refuse to close.
  const force = setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
  force.unref();

  server.close(async () => {
    try {
      await prisma.$disconnect();
    } finally {
      process.exit(exitCode);
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM")); // sent by Render, Docker, etc.

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
  shutdown("unhandledRejection", 1);
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
  shutdown("uncaughtException", 1);
});
// ==========================================
// END OF FILE: backend/src/server.ts
// ==========================================