// ==========================================
// FILE: backend/src/modules/sellers/sellers.controller.ts
// PURPOSE: API handlers for sellers.
// ==========================================
import { Request, Response, NextFunction } from "express";
import * as service from "./sellers.service";
import { ApiError } from "../../utils/ApiError";
import { parse } from "../../utils/parse";
import { sellerOrdersQuerySchema } from "./sellers.schema";

export async function onboard(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const data = await service.onboardSeller(req.user.sub, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const data = await service.getSellerProfile(req.user.sub);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getOrders(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const query = parse(sellerOrdersQuerySchema, req.query);
    const { items, total, page, limit } = await service.getSellerOrders(req.user.sub, req.user.role, query);
    res.json({ success: true, data: items, meta: { total, page, limit } });
  } catch (err) {
    next(err);
  }
}
// ==========================================
// END OF FILE: backend/src/modules/sellers/sellers.controller.ts
// ==========================================