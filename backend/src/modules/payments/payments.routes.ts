// ==========================================
// FILE: backend/src/modules/payments/payments.routes.ts
// PURPOSE: Routes for creating payments and handling webhooks.
// ==========================================
import { createHash, timingSafeEqual } from "crypto";
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.middleware";
import { env } from "../../config/env";
import * as service from "./payments.service";
import { ApiError } from "../../utils/ApiError";

const router = Router();

const orderIdParamSchema = z.object({ orderId: z.string().min(1) });

const webhookSchema = z.object({
  reference: z.string().min(1),
  status: z.enum(["SUCCEEDED", "FAILED"]),
  provider: z.enum(["STRIPE", "MPESA"]).default("STRIPE"),
  providerRef: z.string().min(1).max(200),
  amountCents: z.number().int().positive(),
  currency: z.string().length(3),
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

// Rejects any webhook that doesn't carry the shared secret.
// Both values are hashed first so the comparison is constant-time and length-safe.
function verifyWebhookSignature(req: Request, _res: Response, next: NextFunction) {
  const provided = req.header("x-payment-signature") ?? "";
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) return next(ApiError.unauthorized());
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(secret).digest();
  if (!timingSafeEqual(a, b)) return next(ApiError.unauthorized());
  next();
}

router.post("/initialize/:orderId", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { orderId } = parse(orderIdParamSchema, req.params);
    const data = await service.initializePayment(orderId, req.user.sub);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// Webhooks don't use user auth. They are authenticated by the provider signature.
router.post("/webhook", verifyWebhookSignature, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = parse(webhookSchema, req.body);
    const result = await service.handleWebhook(input);
    res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
});

export default router;
// ==========================================
// END OF FILE: backend/src/modules/payments/payments.routes.ts
// ==========================================