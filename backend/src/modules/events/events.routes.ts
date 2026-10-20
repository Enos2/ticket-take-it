// ==========================================
// FILE: backend/src/modules/events/events.routes.ts
// PURPOSE: Routes for events, including nested ticket routes.
// ==========================================
import { Router } from "express";
import { authenticate, authorize } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { createEventSchema } from "./events.schema";
import * as controller from "./events.controller";
import ticketRoutes from "../tickets/tickets.routes";

const router = Router();

router.get("/", controller.getAll);
router.post("/", authenticate, authorize("SELLER", "ADMIN"), validate(createEventSchema), controller.create);

// Nested route: /events/:eventId/tickets
router.use("/:eventId/tickets", ticketRoutes);

export default router;
// ==========================================
// END OF FILE: backend/src/modules/events/events.routes.ts
// LOCATION: backend/src/modules/events/events.routes.ts
// LAST UPDATED: October 19, 2026
// ==========================================