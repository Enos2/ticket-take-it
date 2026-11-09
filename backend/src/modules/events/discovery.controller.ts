// ==========================================
// FILE: backend/src/modules/events/discovery.controller.ts
// PURPOSE: API handlers for searching events, the event page, related events and the filter options.
// ==========================================
import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { parse } from "../../utils/parse";
import { lookupEventsQuerySchema, searchEventsQuerySchema } from "./discovery.schema";
import * as service from "./discovery.service";

const slugParam = z.object({ slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/) });

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

export async function detail(req: Request, res: Response, next: NextFunction) {
  try {
    const { slug } = parse(slugParam, req.params);
    res.json({ success: true, data: await service.getEventDetail(slug) });
  } catch (err) {
    next(err);
  }
}

export async function similar(req: Request, res: Response, next: NextFunction) {
  try {
    const { slug } = parse(slugParam, req.params);
    res.json({ success: true, data: await service.similarEvents(slug) });
  } catch (err) {
    next(err);
  }
}

export async function trending(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await service.trendingEvents() });
  } catch (err) {
    next(err);
  }
}

export async function lookup(req: Request, res: Response, next: NextFunction) {
  try {
    const { slugs } = parse(lookupEventsQuerySchema, req.query);
    res.json({ success: true, data: await service.lookupEvents(slugs) });
  } catch (err) {
    next(err);
  }
}
// ==========================================
// END OF FILE: backend/src/modules/events/discovery.controller.ts
// ==========================================