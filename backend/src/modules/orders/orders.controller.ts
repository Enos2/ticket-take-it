// ==========================================
// FILE: backend/src/modules/orders/orders.controller.ts
// PURPOSE: API handlers for orders.
// ==========================================
import { Request, Response, NextFunction } from "express";
import * as service from "./orders.service";
import { ApiError } from "../../utils/ApiError";
import { parse } from "../../utils/parse";
import { orderIdParamSchema } from "./orders.schema";

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const data = await service.createOrder(req.user.sub, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getMyOrders(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const data = await service.getUserOrders(req.user.sub);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getMyTickets(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const data = await service.getUserTickets(req.user.sub);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { orderId } = parse(orderIdParamSchema, req.params);
    const data = await service.getOrderById(req.user.sub, req.user.role, orderId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function cancel(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { orderId } = parse(orderIdParamSchema, req.params);
    const data = await service.cancelOrder(req.user.sub, orderId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
// ==========================================
// END OF FILE: backend/src/modules/orders/orders.controller.ts
// ==========================================