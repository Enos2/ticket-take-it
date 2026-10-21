// ==========================================
// FILE: backend/src/modules/events/events.controller.ts
// PURPOSE: API handlers for events.
// ==========================================
import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as service from "./events.service";
import { ApiError } from "../../utils/ApiError";
import { listEventsQuerySchema, eventSlugParamSchema } from "./events.schema";

function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues
      .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
      .join("; ");
    throw ApiError.badRequest(message);
  }
  return result.data;
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const data = await service.createEvent(req.user.sub, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getAll(req: Request, res: Response, next: NextFunction) {
  try {
    const query = parse(listEventsQuerySchema, req.query);
    const { items, total, page, limit } = await service.getAllEvents(query);
    res.json({ success: true, data: items, meta: { total, page, limit } });
  } catch (err) {
    next(err);
  }
}

export async function getBySlug(req: Request, res: Response, next: NextFunction) {
  try {
    const { slug } = parse(eventSlugParamSchema, req.params);
    const data = await service.getEventBySlug(slug);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
// ==========================================
// END OF FILE: backend/src/modules/events/events.controller.ts
// ==========================================