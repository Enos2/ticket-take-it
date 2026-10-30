// ==========================================
// FILE: backend/src/modules/events/events.routes.ts
// PURPOSE: Routes for events, including search, duplication and nested ticket routes.
// ==========================================
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { ApiError } from "../../utils/ApiError";
import { parse } from "../../utils/parse";
import { createEventSchema, updateEventSchema } from "./events.schema";
import * as controller from "./events.controller";
import * as discovery from "./discovery.controller";
import { duplicateEvent } from "./duplicate.service";
import ticketRoutes from "../tickets/tickets.routes";

const router = Router();

const manage = [authenticate, authorize("SELLER", "ADMIN")];

const eventIdParam = z.object({ eventId: z.string().min(1).max(64) });
const duplicateBody = z.object({
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
});

// Public: search and filter live events
router.get("/", discovery.search);
router.get("/filters", discovery.filters); // must stay above /:slug

// Nested route: /events/:eventId/tickets
router.use("/:eventId/tickets", ticketRoutes);

// Event detail by slug: /events/:slug
router.get("/:slug", controller.getBySlug);

// Seller / admin management
router.post("/", ...manage, validate(createEventSchema), controller.create);
router.patch("/:eventId", ...manage, validate(updateEventSchema), controller.update);
router.post("/:eventId/submit", ...manage, controller.submit); // send for review
router.post("/:eventId/withdraw", ...manage, controller.withdraw); // take it back out of review
router.post("/:eventId/publish", ...manage, controller.publish); // admin: publish now. seller: same as submit
router.post("/:eventId/unpublish", ...manage, controller.unpublish);
router.post("/:eventId/cancel", ...manage, controller.cancel);
router.delete("/:eventId", ...manage, controller.remove);

// Copy an event to new dates, as a new draft
router.post("/:eventId/duplicate", ...manage, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { eventId } = parse(eventIdParam, req.params);
    const body = parse(duplicateBody, req.body);
    const data = await duplicateEvent(req.user.sub, req.user.role, eventId, body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
// ==========================================
// END OF FILE: backend/src/modules/events/events.routes.ts
// ==========================================