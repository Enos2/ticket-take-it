// ==========================================
// FILE: backend/src/modules/payments/payments.routes.ts
// PURPOSE: Routes for creating payments and handling webhooks.
// ==========================================
import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import * as service from "./payments.service";
import { ApiError } from "../../utils/ApiError";

const router = Router();

router.post("/initialize/:orderId", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const data = await service.initializePayment(req.params.orderId, req.user.sub);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// Webhooks shouldn't use auth middleware, they use provider signatures instead.
router.post("/webhook", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reference, status } = req.body;
    await service.handleWebhook(reference, status);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
// ==========================================
// END OF FILE: backend/src/modules/payments/payments.routes.ts
// LOCATION: backend/src/modules/payments/payments.routes.ts
// LAST UPDATED: October 21, 2026
// ==========================================