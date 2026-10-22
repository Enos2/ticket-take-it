// ==========================================
// FILE: backend/src/modules/tickets/tickets.routes.ts
// PURPOSE: Routes for managing tickets.
// ==========================================
import { Router } from "express";
import { authenticate, authorize } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { createTicketTypeSchema, updateTicketTypeSchema } from "./tickets.schema";
import * as controller from "./tickets.controller";

const router = Router({ mergeParams: true }); // mergeParams allows access to :eventId from the parent route

// Public: anyone can see available tickets for a published event
router.get("/", controller.getByEvent);

// Seller / admin management
const manage = [authenticate, authorize("SELLER", "ADMIN")];

router.post("/", ...manage, validate(createTicketTypeSchema), controller.create);
router.patch("/:ticketId", ...manage, validate(updateTicketTypeSchema), controller.update);
router.delete("/:ticketId", ...manage, controller.remove);

export default router;
// ==========================================
// END OF FILE: backend/src/modules/tickets/tickets.routes.ts
// ==========================================