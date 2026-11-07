// ==========================================
// FILE: backend/src/modules/system/outbox.service.ts
// PURPOSE: Retries emails that failed, shows the state of the email queue, and cleans up old rows.
// ==========================================
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";
import { LEASE_MS, deliver, settleAttempt } from "../../utils/email";

const DAY_MS = 24 * 60 * 60 * 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let lastPurge = 0;

// Runs every minute. Sends queued emails that are due. Returns how many were sent.
export async function processEmailOutbox(): Promise<number> {
  if (!env.RESEND_API_KEY) return 0;

  const now = new Date();
  const due = await prisma.emailOutbox.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: "asc" },
    take: 20,
  });

  let sent = 0;
  for (const row of due) {
    // Claim it: pushes its next attempt out, so a second server can't send the same email.
    const claimed = await prisma.emailOutbox.updateMany({
      where: { id: row.id, status: "PENDING", nextAttemptAt: { lte: now } },
      data: { nextAttemptAt: new Date(Date.now() + LEASE_MS) },
    });
    if (claimed.count === 0) continue;

    const result = await deliver({ to: row.toEmail, subject: row.subject, html: row.html, text: row.text });
    await settleAttempt(row.id, row.attempts, result);
    if (result.ok) sent++;

    await sleep(600); // stays under the provider's rate limit
  }

  await purgeOld();
  return sent;
}

// Once an hour: sent emails are kept for 14 days and failed ones for 60.
async function purgeOld(): Promise<void> {
  if (Date.now() - lastPurge < 60 * 60_000) return;
  lastPurge = Date.now();

  await prisma.emailOutbox.deleteMany({ where: { status: "SENT", sentAt: { lt: new Date(Date.now() - 14 * DAY_MS) } } });
  await prisma.emailOutbox.deleteMany({ where: { status: "FAILED", createdAt: { lt: new Date(Date.now() - 60 * DAY_MS) } } });
}

export async function getEmailStats() {
  const now = Date.now();

  const [pending, sent24h, failed7d, oldest, failures] = await Promise.all([
    prisma.emailOutbox.count({ where: { status: "PENDING" } }),
    prisma.emailOutbox.count({ where: { status: "SENT", sentAt: { gte: new Date(now - DAY_MS) } } }),
    prisma.emailOutbox.count({ where: { status: "FAILED", createdAt: { gte: new Date(now - 7 * DAY_MS) } } }),
    prisma.emailOutbox.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.emailOutbox.findMany({
      where: { status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, toEmail: true, subject: true, attempts: true, lastError: true, createdAt: true },
    }),
  ]);

  return {
    configured: Boolean(env.RESEND_API_KEY),
    pending,
    sent24h,
    failed7d,
    oldestPendingMinutes: oldest ? Math.round((now - oldest.createdAt.getTime()) / 60_000) : null,
    recentFailures: failures,
  };
}

// Puts a failed email back in the queue for a fresh run of attempts.
export async function retryFailedEmail(id: string) {
  const row = await prisma.emailOutbox.findUnique({ where: { id }, select: { status: true, html: true } });
  if (!row) throw ApiError.notFound("Email not found");
  if (row.status !== "FAILED" || row.html === "") throw ApiError.badRequest("Only a failed email can be retried");

  return await prisma.emailOutbox.update({
    where: { id },
    data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lastError: null },
    select: { id: true, status: true },
  });
}
// ==========================================
// END OF FILE: backend/src/modules/system/outbox.service.ts
// ==========================================