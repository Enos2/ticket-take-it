// ==========================================
// FILE: backend/src/modules/tickets/tickets.controller.ts
// PURPOSE: API handlers for tickets.
// ==========================================
import { Request, Response, NextFunction } from "express";
import * as service from "./tickets.service";
import { ApiError } from "../../utils/ApiError";
import { parse } from "../../utils/parse";
import { eventIdParamSchema, ticketParamsSchema } from "./tickets.schema";

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { eventId } = parse(eventIdParamSchema, req.params);
    const data = await service.createTicketType(req.user.sub, req.user.role, eventId, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { eventId, ticketId } = parse(ticketParamsSchema, req.params);
    const data = await service.updateTicketType(req.user.sub, req.user.role, eventId, ticketId, req.body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { eventId, ticketId } = parse(ticketParamsSchema, req.params);
    await service.deleteTicketType(req.user.sub, req.user.role, eventId, ticketId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function getByEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const { eventId } = parse(eventIdParamSchema, req.params);
    const data = await service.getTicketsForEvent(eventId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
// ==========================================
// END OF FILE: backend/src/modules/tickets/tickets.controller.ts
// ==========================================