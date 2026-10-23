// ==========================================
// FILE: backend/src/modules/payments/payments.routes.ts
// PURPOSE: Routes for starting payments and receiving provider callbacks.
// ==========================================
import { Router, Request, Response, NextFunction } from "express";
import { authenticate, requireVerifiedEmail } from "../../middleware/auth.middleware";
import { paymentLimiter } from "../../middleware/rateLimit.middleware";
import { validate } from "../../middleware/validate.middleware";
import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";
import { logger } from "../../utils/logger";
import { parse } from "../../utils/parse";
import { safeEqual } from "../../utils/safeEqual";
import { initializePaymentSchema, mockWebhookSchema, paymentOrderParamSchema } from "./payments.schema";
import * as service from "./payments.service";
import { handleStkCallback } from "./mpesa.service";
import { handleWebhook } from "./settlement.service";

const router = Router();

// ---- public: which payment methods exist ----
router.get("/methods", (_req: Request, res: Response) => {
  res.json({ success: true, data: service.getPaymentMethods() });
});

// ---- buyer ----
router.post(
  "/initialize/:orderId",
  authenticate,
  paymentLimiter,
  requireVerifiedEmail,
  validate(initializePaymentSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw ApiError.unauthorized();
      const { orderId } = parse(paymentOrderParamSchema, req.params);
      const data = await service.initializePayment(orderId, req.user.sub, req.body);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.get("/status/:orderId", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { orderId } = parse(paymentOrderParamSchema, req.params);
    const data = await service.getPaymentStatus(orderId, req.user.sub);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ---- Safaricom callback. Protected by the secret in the URL, and success is double-checked with Safaricom. ----
router.post("/callbacks/stk/:secret", async (req: Request, res: Response) => {
  const cfg = env.mpesa;
  if (!cfg || !safeEqual(req.params.secret, cfg.callbackSecret)) {
    return res.status(404).json({ success: false, message: "Not found" });
  }

  try {
    await handleStkCallback(req.body);
  } catch (err) {
    // Safaricom doesn't retry, and the reconciliation job will pick the payment up.
    logger.error({ err }, "STK callback processing failed");
  }

  return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// ---- Mock webhook for development testing only ----
function mockOnly(_req: Request, _res: Response, next: NextFunction) {
  if (!env.ENABLE_MOCK_PAYMENTS) return next(ApiError.notFound("Not found"));
  next();
}

function verifyMockSignature(req: Request, _res: Response, next: NextFunction) {
  const provided = req.header("x-payment-signature") ?? "";
  if (!env.PAYMENT_WEBHOOK_SECRET || !safeEqual(provided, env.PAYMENT_WEBHOOK_SECRET)) {
    return next(ApiError.unauthorized());
  }
  next();
}

router.post(
  "/webhook",
  mockOnly,
  verifyMockSignature,
  validate(mockWebhookSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await handleWebhook({ ...req.body, provider: "MANUAL" });
      res.json({ success: true, result });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
// ==========================================
// END OF FILE: backend/src/modules/payments/payments.routes.ts
// ==========================================