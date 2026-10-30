// ==========================================
// FILE: backend/src/modules/events/events.routes.ts
// PURPOSE: Routes for events, including nested ticket routes.
// ==========================================
import { Router } from "express";
import { authenticate, authorize } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { createEventSchema, updateEventSchema } from "./events.schema";
import * as controller from "./events.controller";
import ticketRoutes from "../tickets/tickets.routes";

const router = Router();

const manage = [authenticate, authorize("SELLER", "ADMIN")];

// Public
router.get("/", controller.getAll);

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

export default router;
// ==========================================
// END OF FILE: backend/src/modules/events/events.routes.ts
// ==========================================