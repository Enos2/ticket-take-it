// ==========================================
// FILE: backend/src/modules/transfers/transfers.controller.ts
// PURPOSE: API handlers for ticket transfers.
// ==========================================
import { Request, Response, NextFunction } from "express";
import * as service from "./transfers.service";
import { ApiError } from "../../utils/ApiError";
import { parse } from "../../utils/parse";
import { transferIdParamSchema } from "./transfers.schema";

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const data = await service.createTransfer(req.user.sub, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const data = await service.listTransfers(req.user.sub);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function accept(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { transferId } = parse(transferIdParamSchema, req.params);
    const data = await service.acceptTransfer(req.user.sub, transferId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function decline(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { transferId } = parse(transferIdParamSchema, req.params);
    await service.declineTransfer(req.user.sub, transferId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function cancel(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { transferId } = parse(transferIdParamSchema, req.params);
    await service.cancelTransfer(req.user.sub, transferId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
// ==========================================
// END OF FILE: backend/src/modules/transfers/transfers.controller.ts
// ==========================================