// ==========================================
// FILE: backend/src/server.ts
// PURPOSE: Starts the server and the background jobs.
// ==========================================
import app from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { prisma } from "./config/database";
import { captureError, flushMonitoring, initMonitoring } from "./utils/monitoring";
import { releaseExpiredOrders } from "./modules/orders/orders.service";
import { cleanupExpiredRefreshTokens } from "./modules/auth/auth.service";
import { reconcilePayments } from "./modules/payments/payments.jobs";
import { reconcileLedger } from "./modules/finance/ledger.service";
import { reconcileSoldOut } from "./modules/events/capacity.service";
import { processEmailOutbox } from "./modules/system/outbox.service";
import { sendEventReminders } from "./modules/engagement/reminders.service";
import { jobFinished, jobStarted, registerJob } from "./modules/system/jobs";

initMonitoring();

const server = app.listen(env.PORT, () => {
  logger.info(`Ticket Take It API running on http://localhost:${env.PORT}`);
});

// Load balancers keep idle connections open for about 60s. Node's default is 5s,
// which causes random 502s. Keep Node's timeouts longer than the proxy's.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

// ---- Background jobs ----
// Each job skips a tick if its previous run is still going, and reports to the health screen.
function startJob(name: string, intervalMs: number, job: () => Promise<number>) {
  registerJob(name, intervalMs);
  let running = false;

  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    jobStarted(name);
    try {
      const count = await job();
      jobFinished(name, count, null);
      if (count > 0) logger.info(`${name}: ${count} item(s)`);
    } catch (err) {
      jobFinished(name, null, err instanceof Error ? err.message : "Job failed");
      logger.error({ err }, `${name} failed`);
      captureError(err, { job: name });
    } finally {
      running = false;
    }
  }, intervalMs);

  timer.unref(); // don't keep the process alive just for a timer
  return timer;
}

const timers = [
  startJob("releaseExpiredOrders", 60_000, releaseExpiredOrders),
  startJob("reconcileSoldOut", 60_000, reconcileSoldOut),
  startJob("reconcilePayments", 60_000, reconcilePayments),
  startJob("reconcileLedger", 60_000, reconcileLedger),
  startJob("processEmailOutbox", 60_000, processEmailOutbox),
  startJob("sendEventReminders", 5 * 60_000, sendEventReminders),
  startJob("cleanupExpiredTokens", 60 * 60_000, cleanupExpiredRefreshTokens),
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
      await flushMonitoring();
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
  captureError(reason, { kind: "unhandledRejection" });
  shutdown("unhandledRejection", 1);
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
  captureError(err, { kind: "uncaughtException" });
  shutdown("uncaughtException", 1);
});
// ==========================================
// END OF FILE: backend/src/server.ts
// ==========================================