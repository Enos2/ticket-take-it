// ==========================================
// FILE: backend/src/modules/orders/orders.routes.ts
// PURPOSE: Routes for purchasing and viewing orders.
// ==========================================
import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { createOrderSchema } from "./orders.schema";
import * as controller from "./orders.controller";

const router = Router();

router.use(authenticate); // All order routes require login

router.post("/", validate(createOrderSchema), controller.create);
router.get("/my-orders", controller.getMyOrders);

export default router;
// ==========================================
// END OF FILE: backend/src/modules/orders/orders.routes.ts
// LOCATION: backend/src/modules/orders/orders.routes.ts
// LAST UPDATED: October 19, 2026
// ==========================================