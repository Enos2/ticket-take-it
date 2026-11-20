// ==========================================
// FILE: backend/src/modules/door/offline.routes.ts
// PURPOSE: Offline scanning: download a gate pack, upload the scans made without internet, and review problems.
// ==========================================
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.middleware";
import { doorLimiter } from "../../middleware/rateLimit.middleware";
import { parse } from "../../utils/parse";
import { audit } from "../system/audit.service";
import type { DoorActor } from "./door.service";
import * as offline from "./offline.service";

const router = Router();

const eventParam = z.object({ eventId: z.string().min(1).max(64) });

const syncBody = z.object({
  eventId: z.string().min(1).max(64),
  deviceId: z.string().trim().min(8).max(64),
  scans: z
    .array(
      z.object({
        id: z.string().trim().min(8).max(64),
        code: z.string().trim().min(10).max(64),
        scannedAt: z.string().datetime({ offset: true }),
        gateId: z.string().trim().min(1).max(64).optional(),
      })
    )
    .min(1)
    .max(offline.MAX_SCANS_PER_SYNC),
});

const actorOf = (req: Request): DoorActor => ({
  id: req.user!.sub,
  email: req.user!.email,
  role: req.user!.role,
  emailVerified: req.emailVerified === true,
});

// Forwards async errors to the error middleware (Express 4 does not do this on its own).
const handle =
  (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

// Organisers, their door staff and admins only. Each handler decides access itself.
router.use(authenticate, doorLimiter);

// The tickets of one event, as hashes, for a phone to keep and scan against with no internet.
router.get("/events/:eventId/offline-pack", handle(async (req, res) => {
  const { eventId } = parse(eventParam, req.params);
  const data = await offline.buildOfflinePack(actorOf(req), eventId);
  await audit(req, {
    action: "door.pack",
    targetType: "event",
    targetId: eventId,
    summary: `Downloaded an offline gate pack (${data.tickets.length} tickets)`,
  });
  // The pack lists who holds each ticket, so it must never be stored by a browser cache or a proxy.
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ success: true, data });
}));

// Scans a phone made without internet, uploaded once it is back online.
router.post("/sync", handle(async (req, res) => {
  const body = parse(syncBody, req.body);
  const data = await offline.syncOfflineScans(actorOf(req), body);
  await audit(req, {
    action: "door.sync",
    targetType: "event",
    targetId: body.eventId,
    summary: `Uploaded ${body.scans.length} offline scan(s): ${data.summary.ADMITTED} admitted, ${body.scans.length - data.summary.ADMITTED} flagged`,
  });
  res.json({ success: true, data });
}));

// Uploaded scans that did not simply admit someone.
router.get("/events/:eventId/offline-scans", handle(async (req, res) => {
  const { eventId } = parse(eventParam, req.params);
  res.json({ success: true, data: await offline.listOfflineConflicts(actorOf(req), eventId) });
}));

export default router;
// ==========================================
// END OF FILE: backend/src/modules/door/offline.routes.ts
// ==========================================