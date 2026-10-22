// ==========================================
// FILE: backend/src/modules/orders/orders.routes.ts
// PURPOSE: Routes for purchasing and viewing orders.
// ==========================================
import { Router } from "express";
import { authenticate, requireVerifiedEmail } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { createOrderSchema } from "./orders.schema";
import * as controller from "./orders.controller";

const router = Router();

router.use(authenticate); // All order routes require login

router.post("/", requireVerifiedEmail, validate(createOrderSchema), controller.create);
router.get("/my-orders", controller.getMyOrders);
router.get("/my-tickets", controller.getMyTickets);

// Keep the :orderId routes AFTER the fixed paths above, or "my-tickets" would be read as an id.
router.get("/:orderId", controller.getOne);
router.post("/:orderId/cancel", controller.cancel);

export default router;
// ==========================================
// END OF FILE: backend/src/modules/orders/orders.routes.ts
// ==========================================