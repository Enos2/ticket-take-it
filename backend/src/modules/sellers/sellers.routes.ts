// ==========================================
// FILE: backend/src/modules/sellers/sellers.routes.ts
// PURPOSE: Secures the seller routes.
// ==========================================
import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { onboardSellerSchema } from "./sellers.schema";
import * as controller from "./sellers.controller";

const router = Router();

router.post("/onboard", authenticate, validate(onboardSellerSchema), controller.onboard);

export default router;
// ==========================================
// END OF FILE: backend/src/modules/sellers/sellers.routes.ts
// LOCATION: backend/src/modules/sellers/sellers.routes.ts
// LAST UPDATED: October 19, 2026
// ==========================================