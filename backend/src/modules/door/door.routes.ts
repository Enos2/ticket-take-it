// ==========================================
// FILE: backend/src/modules/door/door.routes.ts
// PURPOSE: Door team, gates, scannable events and live attendance.
// ==========================================
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.middleware";
import { doorLimiter } from "../../middleware/rateLimit.middleware";
import { parse } from "../../utils/parse";
import { audit } from "../system/audit.service";
import * as door from "./door.service";
import type { DoorActor } from "./door.service";

const router = Router();

const eventParam = z.object({ eventId: z.string().min(1).max(64) });
const gateParam = z.object({ eventId: z.string().min(1).max(64), gateId: z.string().min(1).max(64) });
const staffParam = z.object({ id: z.string().min(1).max(64) });

const gateBody = z.object({
  name: z.string().trim().min(2).max(40),
  allowedTiers: z.array(z.enum(["EARLY_BIRD", "REGULAR", "VIP", "VVIP", "GROUP"])).max(5).default([]),
});

const staffBody = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

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

// Everything here decides access itself: organisers, their door staff, and admins.
router.use(authenticate, doorLimiter);

// ---- what can I scan? ----
router.get("/events", handle(async (req, res) => {
  res.json({ success: true, data: await door.listScannableEvents(actorOf(req)) });
}));

router.get("/events/:eventId/live", handle(async (req, res) => {
  const { eventId } = parse(eventParam, req.params);
  res.json({ success: true, data: await door.getLiveAttendance(actorOf(req), eventId) });
}));

// ---- gates ----
router.get("/events/:eventId/gates", handle(async (req, res) => {
  const { eventId } = parse(eventParam, req.params);
  res.json({ success: true, data: await door.listGates(actorOf(req), eventId) });
}));

router.post("/events/:eventId/gates", handle(async (req, res) => {
  const { eventId } = parse(eventParam, req.params);
  const body = parse(gateBody, req.body);
  const data = await door.createGate(actorOf(req), eventId, body);
  await audit(req, { action: "gate.create", targetType: "event", targetId: eventId, summary: `Added the gate "${data.name}"` });
  res.status(201).json({ success: true, data });
}));

router.delete("/events/:eventId/gates/:gateId", handle(async (req, res) => {
  const { eventId, gateId } = parse(gateParam, req.params);
  await door.deleteGate(actorOf(req), eventId, gateId);
  await audit(req, { action: "gate.delete", targetType: "event", targetId: eventId, summary: "Removed a gate", metadata: { gateId } });
  res.json({ success: true });
}));

// ---- the organiser's door team ----
router.get("/staff", handle(async (req, res) => {
  res.json({ success: true, data: await door.listStaff(req.user!.sub) });
}));

router.post("/staff", handle(async (req, res) => {
  const { email } = parse(staffBody, req.body);
  const data = await door.addStaff(req.user!.sub, email);
  // The log says that someone was added, never who.
  await audit(req, { action: "staff.add", targetType: "user", targetId: req.user!.sub, summary: "Added a door team member", metadata: { staffId: data.id } });
  res.status(201).json({ success: true, data });
}));

router.delete("/staff/:id", handle(async (req, res) => {
  const { id } = parse(staffParam, req.params);
  await door.removeStaff(req.user!.sub, id);
  await audit(req, { action: "staff.remove", targetType: "user", targetId: req.user!.sub, summary: "Removed a door team member", metadata: { staffId: id } });
  res.json({ success: true });
}));

export default router;
// ==========================================
// END OF FILE: backend/src/modules/door/door.routes.ts
// ==========================================