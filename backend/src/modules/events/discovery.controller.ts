// ==========================================
// FILE: backend/src/modules/events/discovery.controller.ts
// PURPOSE: API handlers for searching events and for the filter options.
// ==========================================
import { Request, Response, NextFunction } from "express";
import { parse } from "../../utils/parse";
import { searchEventsQuerySchema } from "./discovery.schema";
import * as service from "./discovery.service";

export async function search(req: Request, res: Response, next: NextFunction) {
  try {
    const query = parse(searchEventsQuerySchema, req.query);
    const { items, total, page, limit } = await service.searchEvents(query);
    res.json({ success: true, data: items, meta: { total, page, limit } });
  } catch (err) {
    next(err);
  }
}

export async function filters(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await service.getFilterOptions() });
  } catch (err) {
    next(err);
  }
}
// ==========================================
// END OF FILE: backend/src/modules/events/discovery.controller.ts
// ==========================================