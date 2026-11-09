// ==========================================
// FILE: backend/src/modules/checkin/checkin.routes.ts
// PURPOSE: Door check-in endpoint for organisers, their door staff and admins.
// ==========================================
import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { doorLimiter } from "../../middleware/rateLimit.middleware";
import { validate } from "../../middleware/validate.middleware";
import { ApiError } from "../../utils/ApiError";
import { checkInSchema } from "./checkin.schema";
import * as service from "./checkin.service";

const router = Router();

// Who may scan is decided in the service: the event's organiser, that organiser's door staff, or an admin.
router.post("/", authenticate, doorLimiter, validate(checkInSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const actor = { id: req.user.sub, email: req.user.email, role: req.user.role, emailVerified: req.emailVerified === true };
    res.json({ success: true, data: await service.checkInTicket(actor, req.body) });
  } catch (err) {
    next(err);
  }
});

export default router;
// ==========================================
// END OF FILE: backend/src/modules/checkin/checkin.routes.ts
// ==========================================