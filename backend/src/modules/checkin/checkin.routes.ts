// ==========================================
// FILE: backend/src/modules/checkin/checkin.routes.ts
// PURPOSE: Door check-in endpoint for sellers and admins.
// ==========================================
import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { ApiError } from "../../utils/ApiError";
import { checkInSchema } from "./checkin.schema";
import * as service from "./checkin.service";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize("SELLER", "ADMIN"),
  validate(checkInSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw ApiError.unauthorized();
      const data = await service.checkInTicket(req.user.sub, req.user.role, req.body.code);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
// ==========================================
// END OF FILE: backend/src/modules/checkin/checkin.routes.ts
// ==========================================