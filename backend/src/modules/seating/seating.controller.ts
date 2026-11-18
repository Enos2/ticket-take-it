// ==========================================
// FILE: backend/src/modules/seating/seating.controller.ts
// PURPOSE: API handlers for seat maps, layouts and kept seats.
// ==========================================
import { Request, Response, NextFunction } from "express";
import * as service from "./seating.service";
import { ApiError } from "../../utils/ApiError";
import { parse } from "../../utils/parse";
import { audit } from "../system/audit.service";
import { seatingEventParamSchema } from "./seating.schema";

export async function publicMap(req: Request, res: Response, next: NextFunction) {
  try {
    const { eventId } = parse(seatingEventParamSchema, req.params);
    const data = await service.getPublicSeatMap(eventId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function manageMap(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { eventId } = parse(seatingEventParamSchema, req.params);
    const data = await service.getManageSeatMap(req.user.sub, req.user.role, eventId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function save(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { eventId } = parse(seatingEventParamSchema, req.params);
    const data = await service.saveLayout(req.user.sub, req.user.role, eventId, req.body);
    await audit(req, { action: "seating.save", targetType: "event", targetId: eventId, summary: "Saved the seat layout" });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { eventId } = parse(seatingEventParamSchema, req.params);
    await service.deleteLayout(req.user.sub, req.user.role, eventId);
    await audit(req, { action: "seating.delete", targetType: "event", targetId: eventId, summary: "Removed the seat layout" });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function block(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { eventId } = parse(seatingEventParamSchema, req.params);
    const data = await service.blockSeats(req.user.sub, req.user.role, eventId, req.body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function give(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { eventId } = parse(seatingEventParamSchema, req.params);
    const data = await service.giveSeats(req.user.sub, req.user.role, eventId, req.body);
    await audit(req, {
      action: "seating.give",
      targetType: "event",
      targetId: eventId,
      summary: `Gave ${data.seats} seat(s) to ${data.recipient.email}`,
    });
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
// ==========================================
// END OF FILE: backend/src/modules/seating/seating.controller.ts
// ==========================================