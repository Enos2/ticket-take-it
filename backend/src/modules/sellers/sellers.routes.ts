// ==========================================
// FILE: backend/src/modules/sellers/sellers.routes.ts
// PURPOSE: Routes for sellers.
// ==========================================
import { Router } from "express";
import { authenticate, authorize, requireVerifiedEmail } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { onboardSellerSchema } from "./sellers.schema";
import * as controller from "./sellers.controller";

const router = Router();

router.use(authenticate);

router.post("/onboard", requireVerifiedEmail, validate(onboardSellerSchema), controller.onboard);
router.get("/me", controller.getMe); // lets the frontend show "pending approval"

router.get("/orders", authorize("SELLER", "ADMIN"), controller.getOrders);
router.get("/events", authorize("SELLER"), controller.getEvents);
router.get("/events/:eventId/summary", authorize("SELLER", "ADMIN"), controller.getEventSummary);
router.get("/events/:eventId/attendees", authorize("SELLER", "ADMIN"), controller.getEventAttendees);

export default router;
// ==========================================
// END OF FILE: backend/src/modules/sellers/sellers.routes.ts
// ==========================================