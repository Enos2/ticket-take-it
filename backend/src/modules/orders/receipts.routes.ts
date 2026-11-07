// ==========================================
// FILE: backend/src/modules/orders/receipts.routes.ts
// PURPOSE: Receipt endpoint for paid orders.
// ==========================================
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.middleware";
import { ApiError } from "../../utils/ApiError";
import { parse } from "../../utils/parse";
import { getReceipt } from "./receipt.service";

const router = Router();

const orderParam = z.object({ orderId: z.string().min(1).max(64) });

router.get("/:orderId", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { orderId } = parse(orderParam, req.params);
    res.json({ success: true, data: await getReceipt(req.user.sub, req.user.role, orderId) });
  } catch (err) {
    next(err);
  }
});

export default router;
// ==========================================
// END OF FILE: backend/src/modules/orders/receipts.routes.ts
// ==========================================