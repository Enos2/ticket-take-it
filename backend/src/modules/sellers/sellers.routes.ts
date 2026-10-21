// ==========================================
// FILE: backend/src/modules/sellers/sellers.routes.ts
// PURPOSE: Routes for sellers.
// ==========================================
import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { onboardSellerSchema } from "./sellers.schema";
import * as service from "./sellers.service";
import { ApiError } from "../../utils/ApiError";

const router = Router();

router.post("/onboard", authenticate, validate(onboardSellerSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const data = await service.onboardSeller(req.user.sub, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.get("/orders", authenticate, authorize("SELLER", "ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const data = await service.getSellerOrders(req.user.sub);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;
// ==========================================
// END OF FILE: backend/src/modules/sellers/sellers.routes.ts
// LOCATION: backend/src/modules/sellers/sellers.routes.ts
// LAST UPDATED: October 21, 2026
// ==========================================