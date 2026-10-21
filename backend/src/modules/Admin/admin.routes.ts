// ==========================================
// FILE: backend/src/modules/admin/admin.routes.ts
// PURPOSE: Admin API routes.
// ==========================================
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../../middleware/auth.middleware";
import * as service from "./admin.service";
import { ApiError } from "../../utils/ApiError";

const router = Router();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const sellerStatusSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "SUSPENDED"]),
});

const idParamSchema = z.object({
  id: z.string().min(1),
});

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

router.use(authenticate, authorize("ADMIN"));

router.get("/users", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = parse(paginationSchema, req.query);
    const { items, total, ...meta } = await service.getAllUsers({ page, limit });
    res.json({ success: true, data: items, meta: { total, ...meta } });
  } catch (err) {
    next(err);
  }
});

router.get("/sellers", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = parse(paginationSchema, req.query);
    const { items, total, ...meta } = await service.getAllSellers({ page, limit });
    res.json({ success: true, data: items, meta: { total, ...meta } });
  } catch (err) {
    next(err);
  }
});

router.patch("/sellers/:id/status", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = parse(idParamSchema, req.params);
    const { status } = parse(sellerStatusSchema, req.body);
    const data = await service.updateSellerStatus(id, status);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
// ==========================================
// END OF FILE: backend/src/modules/admin/admin.routes.ts
// ==========================================