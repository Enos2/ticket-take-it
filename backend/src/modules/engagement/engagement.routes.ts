// ==========================================
// FILE: backend/src/modules/engagement/engagement.routes.ts
// PURPOSE: Routes for saved events, followed organisers and email preferences. Signed-in people only.
// ==========================================
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.middleware";
import { paginationSchema } from "../../utils/pagination";
import { parse } from "../../utils/parse";
import * as service from "./engagement.service";

const router = Router();

const eventParam = z.object({ eventId: z.string().min(1).max(64) });
const sellerParam = z.object({ sellerId: z.string().min(1).max(64) });

const prefsBody = z
  .object({ notifyReminders: z.boolean().optional(), notifyNewEvents: z.boolean().optional() })
  .refine((d) => d.notifyReminders !== undefined || d.notifyNewEvents !== undefined, { message: "Provide a setting to change" });

// Forwards async errors to the error middleware (Express 4 does not do this on its own).
const handle =
  (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

router.use(authenticate);

// ---- saved events ----
router.get("/favorites", handle(async (req, res) => {
  const { items, total, page, limit } = await service.listFavorites(req.user!.sub, parse(paginationSchema, req.query));
  res.json({ success: true, data: items, meta: { total, page, limit } });
}));

router.get("/favorites/ids", handle(async (req, res) => {
  res.json({ success: true, data: await service.favoriteIds(req.user!.sub) });
}));

router.post("/favorites/:eventId", handle(async (req, res) => {
  const { eventId } = parse(eventParam, req.params);
  await service.addFavorite(req.user!.sub, eventId);
  res.status(201).json({ success: true });
}));

router.delete("/favorites/:eventId", handle(async (req, res) => {
  const { eventId } = parse(eventParam, req.params);
  await service.removeFavorite(req.user!.sub, eventId);
  res.json({ success: true });
}));

// ---- followed organisers ----
router.get("/follows", handle(async (req, res) => {
  const { items, total, page, limit } = await service.listFollowing(req.user!.sub, parse(paginationSchema, req.query));
  res.json({ success: true, data: items, meta: { total, page, limit } });
}));

router.get("/follows/ids", handle(async (req, res) => {
  res.json({ success: true, data: await service.followIds(req.user!.sub) });
}));

router.post("/follows/:sellerId", handle(async (req, res) => {
  const { sellerId } = parse(sellerParam, req.params);
  await service.followOrganizer(req.user!.sub, sellerId);
  res.status(201).json({ success: true });
}));

router.delete("/follows/:sellerId", handle(async (req, res) => {
  const { sellerId } = parse(sellerParam, req.params);
  await service.unfollowOrganizer(req.user!.sub, sellerId);
  res.json({ success: true });
}));

// ---- email preferences ----
router.get("/preferences", handle(async (req, res) => {
  res.json({ success: true, data: await service.getPreferences(req.user!.sub) });
}));

router.patch("/preferences", handle(async (req, res) => {
  const body = parse(prefsBody, req.body);
  res.json({ success: true, data: await service.setPreferences(req.user!.sub, body) });
}));

export default router;
// ==========================================
// END OF FILE: backend/src/modules/engagement/engagement.routes.ts
// ==========================================