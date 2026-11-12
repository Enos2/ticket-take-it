// ==========================================
// FILE: backend/src/modules/events/comps.controller.ts
// PURPOSE: API handlers for complimentary (given-out) tickets.
// ==========================================
import { Request, Response, NextFunction } from "express";
import * as service from "./comps.service";
import { ApiError } from "../../utils/ApiError";
import { parse } from "../../utils/parse";
import { audit } from "../system/audit.service";
import { compEventParamSchema, compTicketParamSchema } from "./comps.schema";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { eventId } = parse(compEventParamSchema, req.params);
    const data = await service.listComps(req.user.sub, req.user.role, eventId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function issue(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { eventId } = parse(compEventParamSchema, req.params);
    const data = await service.issueComps(req.user.sub, req.user.role, eventId, req.body);
    await audit(req, {
      action: "comp.issue",
      targetType: "event",
      targetId: eventId,
      summary: `Gave ${data.quantity} complimentary ${data.ticketType} ticket(s) for "${data.eventTitle}" to ${data.recipient.email}`,
    });
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function revoke(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { eventId, ticketId } = parse(compTicketParamSchema, req.params);
    await service.revokeComp(req.user.sub, req.user.role, eventId, ticketId);
    await audit(req, { action: "comp.revoke", targetType: "event", targetId: eventId, summary: "Took back a complimentary ticket" });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
// ==========================================
// END OF FILE: backend/src/modules/events/comps.controller.ts
// ==========================================