// ==========================================
// FILE: backend/src/modules/events/events.controller.ts
// PURPOSE: API handlers for events.
// ==========================================
import { Request, Response, NextFunction } from "express";
import * as service from "./events.service";
import * as moderation from "./moderation.service";
import { ApiError } from "../../utils/ApiError";
import { parse } from "../../utils/parse";
import { listEventsQuerySchema, eventSlugParamSchema, eventIdParamSchema } from "./events.schema";

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

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { eventId } = parse(eventIdParamSchema, req.params);
    const data = await service.updateEvent(req.user.sub, req.user.role, eventId, req.body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// Send the event for review (admins publish their own events straight away).
export async function submit(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { eventId } = parse(eventIdParamSchema, req.params);
    const data = await moderation.submitEvent(req.user.sub, req.user.role, eventId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// Kept so older screens keep working. Admins publish a draft directly. Sellers' requests go to review.
export async function publish(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { eventId } = parse(eventIdParamSchema, req.params);
    const data =
      req.user.role === "ADMIN"
        ? await service.publishEvent(req.user.sub, req.user.role, eventId)
        : await moderation.submitEvent(req.user.sub, req.user.role, eventId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function withdraw(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { eventId } = parse(eventIdParamSchema, req.params);
    const data = await moderation.withdrawSubmission(req.user.sub, req.user.role, eventId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function unpublish(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { eventId } = parse(eventIdParamSchema, req.params);
    const data = await service.unpublishEvent(req.user.sub, req.user.role, eventId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function cancel(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { eventId } = parse(eventIdParamSchema, req.params);
    const data = await service.cancelEvent(req.user.sub, req.user.role, eventId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { eventId } = parse(eventIdParamSchema, req.params);
    await service.deleteEvent(req.user.sub, req.user.role, eventId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
// ==========================================
// END OF FILE: backend/src/modules/events/events.controller.ts
// ==========================================