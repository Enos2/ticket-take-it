// ==========================================
// FILE: backend/src/modules/sellers/sellers.controller.ts
// PURPOSE: Handles the API request for seller onboarding.
// ==========================================
import { Request, Response, NextFunction } from "express";
import * as service from "./sellers.service";
import { ApiError } from "../../utils/ApiError";

export async function onboard(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const data = await service.onboardSeller(req.user.sub, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}
// ==========================================
// END OF FILE: backend/src/modules/sellers/sellers.controller.ts
// LOCATION: backend/src/modules/sellers/sellers.controller.ts
// LAST UPDATED: October 19, 2026
// ==========================================