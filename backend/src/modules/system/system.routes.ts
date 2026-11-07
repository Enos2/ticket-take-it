// ==========================================
// FILE: backend/src/modules/system/system.routes.ts
// PURPOSE: System health, the audit log, failed emails, and the endpoint browsers use to report crashes.
// ==========================================
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { authenticate, authorize } from "../../middleware/auth.middleware";
import { clientErrorLimiter } from "../../middleware/rateLimit.middleware";
import { logger } from "../../utils/logger";
import { captureError } from "../../utils/monitoring";
import { paginationSchema } from "../../utils/pagination";
import { parse } from "../../utils/parse";
import { audit, listAudit } from "./audit.service";
import { getJobs } from "./jobs";
import { getEmailStats, retryFailedEmail } from "./outbox.service";

const router = Router();

const idParam = z.object({ id: z.string().min(1).max(64) });

const auditQuery = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  action: z.string().trim().max(40).regex(/^[a-z_.]+$/).optional(),
});

const clientErrorBody = z.object({
  kind: z.enum(["render", "error", "promise"]),
  message: z.string().max(500),
  stack: z.string().max(4000).optional(),
  url: z.string().max(300).optional(),
});

// Forwards async errors to the error middleware (Express 4 does not do this on its own).
const handle =
  (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const adminOnly = [authenticate, authorize("ADMIN")];

router.get("/health", ...adminOnly, handle(async (_req, res) => {
  const started = Date.now();
  let databaseOk = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    databaseOk = false;
  }
  const latencyMs = Date.now() - started;

  const email = await getEmailStats().catch(() => null);

  res.json({
    success: true,
    data: {
      server: { uptimeSeconds: Math.round(process.uptime()), environment: env.NODE_ENV, nodeVersion: process.version },
      database: { ok: databaseOk, latencyMs },
      jobs: getJobs(),
      email,
      services: {
        paystack: Boolean(env.paystack),
        mpesa: Boolean(env.mpesa),
        email: Boolean(env.RESEND_API_KEY),
        monitoring: Boolean(env.SENTRY_DSN),
      },
    },
  });
}));

router.post("/emails/:id/retry", ...adminOnly, handle(async (req, res) => {
  const { id } = parse(idParam, req.params);
  const data = await retryFailedEmail(id);
  await audit(req, { action: "email.retry", targetType: "email", targetId: id, summary: "Put a failed email back in the queue" });
  res.json({ success: true, data });
}));

router.get("/audit", ...adminOnly, handle(async (req, res) => {
  const { q, action, ...pagination } = parse(auditQuery, req.query);
  const { items, total, page, limit } = await listAudit(pagination, { q: q || undefined, action });
  res.json({ success: true, data: items, meta: { total, page, limit } });
}));

// Public on purpose: a browser that crashed may not be signed in. Small, validated and rate limited.
router.post("/client-error", clientErrorLimiter, (req: Request, res: Response) => {
  const parsed = clientErrorBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid report" });

  const { kind, message, stack, url } = parsed.data;
  logger.error({ browser: { kind, url, stack } }, `Browser error: ${message}`);
  captureError(new Error(`Browser: ${message}`), { source: "browser", kind });
  return res.status(202).json({ success: true });
});

export default router;
// ==========================================
// END OF FILE: backend/src/modules/system/system.routes.ts
// ==========================================