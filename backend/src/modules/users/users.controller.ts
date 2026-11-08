// ==========================================
// FILE: backend/src/modules/users/users.controller.ts
// PURPOSE: API handlers for a person's own profile.
// ==========================================
import { Request, Response, NextFunction } from "express";
import * as service from "./users.service";
import { ApiError } from "../../utils/ApiError";

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    res.json({ success: true, data: await service.getProfile(req.user.sub) });
  } catch (err) {
    next(err);
  }
}

export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    res.json({ success: true, data: await service.updateProfile(req.user.sub, req.body) });
  } catch (err) {
    next(err);
  }
}

export async function deleteMe(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    res.json({ success: true, data: await service.deleteAccount(req.user.sub, req.body.password) });
  } catch (err) {
    next(err);
  }
}
// ==========================================
// END OF FILE: backend/src/modules/users/users.controller.ts
// ==========================================