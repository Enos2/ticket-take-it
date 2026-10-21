// ==========================================
// FILE: backend/src/modules/sellers/sellers.routes.ts
// PURPOSE: Routes for sellers.
// ==========================================
import { Router } from "express";
import { authenticate, authorize } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { onboardSellerSchema } from "./sellers.schema";
import * as controller from "./sellers.controller";

const router = Router();

router.use(authenticate);

router.post("/onboard", validate(onboardSellerSchema), controller.onboard);
router.get("/me", controller.getMe); // lets the frontend show "pending approval"
router.get("/orders", authorize("SELLER", "ADMIN"), controller.getOrders);

export default router;
// ==========================================
// END OF FILE: backend/src/modules/sellers/sellers.routes.ts
// ==========================================