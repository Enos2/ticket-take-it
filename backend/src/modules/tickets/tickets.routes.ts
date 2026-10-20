// ==========================================
// FILE: backend/src/modules/tickets/tickets.routes.ts
// PURPOSE: Routes for managing tickets.
// ==========================================
import { Router } from "express";
import { authenticate, authorize } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { createTicketTypeSchema } from "./tickets.schema";
import * as controller from "./tickets.controller";

const router = Router({ mergeParams: true }); // mergeParams allows access to :eventId from the parent route

// Public route: Anyone can see available tickets for an event
router.get("/", controller.getByEvent);

// Protected route: Only SELLERS can add tickets
router.post(
  "/", 
  authenticate, 
  authorize("SELLER", "ADMIN"), 
  validate(createTicketTypeSchema), 
  controller.create
);

export default router;
// ==========================================
// END OF FILE: backend/src/modules/tickets/tickets.routes.ts
// LOCATION: backend/src/modules/tickets/tickets.routes.ts
// LAST UPDATED: October 19, 2026
// ==========================================