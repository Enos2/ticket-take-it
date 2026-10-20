// ==========================================
// FILE: backend/src/modules/events/events.controller.ts
// PURPOSE: API handlers for events.
// ==========================================
import { Request, Response, NextFunction } from "express";
import * as service from "./events.service";
import { ApiError } from "../../utils/ApiError";

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const data = await service.createEvent(req.user.sub, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getAll(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getAllEvents();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}
// ==========================================
// END OF FILE: backend/src/modules/events/events.controller.ts
// LOCATION: backend/src/modules/events/events.controller.ts
// LAST UPDATED: October 19, 2026
// ==========================================