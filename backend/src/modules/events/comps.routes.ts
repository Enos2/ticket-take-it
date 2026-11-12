// ==========================================
// FILE: backend/src/modules/events/comps.routes.ts
// PURPOSE: Routes for giving out held-back tickets: /events/:eventId/comps
// ==========================================
import { Router } from "express";
import { authenticate, authorize } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { issueCompSchema } from "./comps.schema";
import * as controller from "./comps.controller";

const router = Router({ mergeParams: true }); // mergeParams gives access to :eventId from the parent route

const manage = [authenticate, authorize("SELLER", "ADMIN")];

router.get("/", ...manage, controller.list); // held-back numbers + who was given tickets
router.post("/", ...manage, validate(issueCompSchema), controller.issue); // give tickets to a guest
router.delete("/:ticketId", ...manage, controller.revoke); // take an unused ticket back

export default router;
// ==========================================
// END OF FILE: backend/src/modules/events/comps.routes.ts
// ==========================================