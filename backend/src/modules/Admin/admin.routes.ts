// ==========================================
// FILE: backend/src/modules/admin/admin.routes.ts
// PURPOSE: Admin API routes.
// ==========================================
import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../../middleware/auth.middleware";
import * as service from "./admin.service";
import { ApiError } from "../../utils/ApiError";

const router = Router();

router.use(authenticate, authorize("ADMIN"));

router.get("/users", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getAllUsers();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get("/sellers", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getAllSellers();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.patch("/sellers/:id/status", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body;
    if (!["APPROVED", "REJECTED", "SUSPENDED"].includes(status)) {
      throw ApiError.badRequest("Invalid status");
    }
    const data = await service.updateSellerStatus(req.params.id, status);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;
// ==========================================
// END OF FILE: backend/src/modules/admin/admin.routes.ts
// LOCATION: backend/src/modules/admin/admin.routes.ts
// LAST UPDATED: October 21, 2026
// ==========================================