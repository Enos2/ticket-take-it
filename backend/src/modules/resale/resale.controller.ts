// ==========================================
// FILE: backend/src/modules/resale/resale.controller.ts
// PURPOSE: API handlers for ticket resale.
// ==========================================
import { Request, Response, NextFunction } from "express";
import * as service from "./resale.service";
import { ApiError } from "../../utils/ApiError";
import { parse } from "../../utils/parse";
import { audit } from "../system/audit.service";
import { resaleEventParamSchema, resaleListingParamSchema } from "./resale.schema";

export async function eventListings(req: Request, res: Response, next: NextFunction) {
  try {
    const { eventId } = parse(resaleEventParamSchema, req.params);
    const data = await service.listForEvent(eventId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getSettings(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { eventId } = parse(resaleEventParamSchema, req.params);
    const data = await service.getSettings(req.user.sub, req.user.role, eventId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateSettings(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { eventId } = parse(resaleEventParamSchema, req.params);
    const data = await service.updateSettings(req.user.sub, req.user.role, eventId, req.body);
    await audit(req, {
      action: "resale.settings",
      targetType: "event",
      targetId: eventId,
      summary: `Resale ${data.enabled ? `allowed up to ${data.maxPercent}% of the original price` : "switched off"}`,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function mine(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const data = await service.myResale(req.user.sub);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function createListing(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const data = await service.createListing(req.user.sub, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function cancelListing(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { listingId } = parse(resaleListingParamSchema, req.params);
    await service.cancelListing(req.user.sub, listingId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function buy(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { listingId } = parse(resaleListingParamSchema, req.params);
    const data = await service.buyListing(req.user.sub, listingId);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function owed(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.listOwedProceeds();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function markPaid(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { listingId } = parse(resaleListingParamSchema, req.params);
    await service.markProceedsPaid(req.user.sub, listingId, req.body);
    await audit(req, { action: "resale.paid", targetType: "resaleListing", targetId: listingId, summary: "Marked resale proceeds as paid" });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
// ==========================================
// END OF FILE: backend/src/modules/resale/resale.controller.ts
// ==========================================