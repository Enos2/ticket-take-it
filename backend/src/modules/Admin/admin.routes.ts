// ==========================================
// FILE: backend/src/modules/admin/admin.routes.ts
// PURPOSE: Admin API routes.
// ==========================================
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../../middleware/auth.middleware";
import { parse } from "../../utils/parse";
import { paginationSchema } from "../../utils/pagination";
import * as service from "./admin.service";
import * as refunds from "../payments/refund.service";

const router = Router();

// ---- schemas ----
const idParam = z.object({ id: z.string().min(1).max(64) });

const sellerStatusBody = z.object({ status: z.enum(["APPROVED", "REJECTED", "SUSPENDED"]) });
const userStatusBody = z.object({ isActive: z.boolean() });
const reasonBody = z.object({ reason: z.string().trim().max(500).optional() });
const noteBody = z.object({ note: z.string().trim().max(500).optional() });

const search = z.string().trim().max(100).optional();

const usersQuery = paginationSchema.extend({ q: search });

const sellersQuery = paginationSchema.extend({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]).optional(),
});

const eventsQuery = paginationSchema.extend({
  status: z.enum(["DRAFT", "PUBLISHED", "SOLD_OUT", "CANCELLED", "COMPLETED"]).optional(),
});

const ordersQuery = paginationSchema.extend({
  status: z.enum(["PENDING", "RESERVED", "PAID", "CANCELLED", "REFUNDED", "EXPIRED"]).optional(),
  eventId: z.string().min(1).max(64).optional(),
  userId: z.string().min(1).max(64).optional(),
  q: search,
});

// Forwards async errors to the error middleware (Express 4 does not do this on its own).
const handle =
  (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

router.use(authenticate, authorize("ADMIN"));

// ---- overview ----
router.get("/stats", handle(async (_req, res) => {
  res.json({ success: true, data: await service.getStats() });
}));

// ---- users ----
router.get("/users", handle(async (req, res) => {
  const { q, ...pagination } = parse(usersQuery, req.query);
  const { items, total, page, limit } = await service.getAllUsers(pagination, q || undefined);
  res.json({ success: true, data: items, meta: { total, page, limit } });
}));

router.patch("/users/:id/status", handle(async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { isActive } = parse(userStatusBody, req.body);
  const data = await service.setUserActive(req.user!.sub, id, isActive);
  res.json({ success: true, data });
}));

// ---- sellers ----
router.get("/sellers", handle(async (req, res) => {
  const { status, ...pagination } = parse(sellersQuery, req.query);
  const { items, total, page, limit } = await service.getAllSellers(pagination, status);
  res.json({ success: true, data: items, meta: { total, page, limit } });
}));

router.patch("/sellers/:id/status", handle(async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { status } = parse(sellerStatusBody, req.body);
  const data = await service.updateSellerStatus(id, status);
  res.json({ success: true, data });
}));

// ---- events ----
router.get("/events", handle(async (req, res) => {
  const { status, ...pagination } = parse(eventsQuery, req.query);
  const { items, total, page, limit } = await service.getAllEvents(pagination, status);
  res.json({ success: true, data: items, meta: { total, page, limit } });
}));

// Refunds all paid orders of a cancelled event, 25 per call. Repeat until `refunded` is 0.
router.post("/events/:id/refund-orders", handle(async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { reason } = parse(reasonBody, req.body ?? {});
  const data = await refunds.refundEventOrders(req.user!.sub, id, reason);
  res.json({ success: true, data });
}));

// ---- orders and refunds ----
router.get("/orders", handle(async (req, res) => {
  const { status, eventId, userId, q, ...pagination } = parse(ordersQuery, req.query);
  const { items, total, page, limit } = await service.getAllOrders(pagination, { status, eventId, userId, q: q || undefined });
  res.json({ success: true, data: items, meta: { total, page, limit } });
}));

router.post("/orders/:id/refund", handle(async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { reason } = parse(reasonBody, req.body ?? {});
  const data = await refunds.refundOrder(req.user!.sub, id, reason);
  res.json({ success: true, data });
}));

router.get("/payments/needs-refund", handle(async (req, res) => {
  const { items, total, page, limit } = await refunds.listPaymentsNeedingRefund(parse(paginationSchema, req.query));
  res.json({ success: true, data: items, meta: { total, page, limit } });
}));

// Tries the automatic refund again (Paystack payments only).
router.post("/payments/:id/retry-refund", handle(async (req, res) => {
  const { id } = parse(idParam, req.params);
  const data = await refunds.retryPaymentRefund(req.user!.sub, id);
  res.json({ success: true, data });
}));

// Marks a payment as refunded after the money was returned by hand (M-Pesa, manual).
router.post("/payments/:id/resolve-refund", handle(async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { note } = parse(noteBody, req.body ?? {});
  const data = await refunds.resolveRefundPayment(req.user!.sub, id, note);
  res.json({ success: true, data });
}));

export default router;
// ==========================================
// END OF FILE: backend/src/modules/admin/admin.routes.ts
// ==========================================