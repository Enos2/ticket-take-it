// ==========================================
// FILE: backend/src/modules/users/users.controller.ts
// PURPOSE: API handlers for users.
// ==========================================
import { Request, Response, NextFunction } from "express";
import * as service from "./users.service";
import { ApiError } from "../../utils/ApiError";

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const data = await service.getProfile(req.user.sub);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
// ==========================================
// END OF FILE: backend/src/modules/users/users.controller.ts
// ==========================================