// ==========================================
// FILE: backend/src/modules/tickets/tickets.controller.ts
// PURPOSE: API handlers for tickets.
// ==========================================
import { Request, Response, NextFunction } from "express";
import * as service from "./tickets.service";
import { ApiError } from "../../utils/ApiError";

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const data = await service.createTicketType(req.user.sub, req.params.eventId, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getByEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getTicketsForEvent(req.params.eventId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}
// ==========================================
// END OF FILE: backend/src/modules/tickets/tickets.controller.ts
// LOCATION: backend/src/modules/tickets/tickets.controller.ts
// LAST UPDATED: October 19, 2026
// ==========================================