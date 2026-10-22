// ==========================================
// FILE: backend/src/modules/auth/auth.routes.ts
// PURPOSE: Connects endpoints to controllers.
// ==========================================
import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { authLimiter } from "../../middleware/rateLimit.middleware";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from "./auth.schema";
import * as controller from "./auth.controller";

const router = Router();

// Strict limiter: these endpoints can be brute-forced or used to spam inboxes.
router.post("/register", authLimiter, validate(registerSchema), controller.register);
router.post("/login", authLimiter, validate(loginSchema), controller.login);
router.post("/forgot-password", authLimiter, validate(forgotPasswordSchema), controller.forgotPassword);
router.post("/reset-password", authLimiter, validate(resetPasswordSchema), controller.resetPassword);
router.post("/resend-verification", authenticate, authLimiter, controller.resendVerification);
router.post("/change-password", authenticate, authLimiter, validate(changePasswordSchema), controller.changePassword);

// High-entropy tokens, so these only fall under the general API limiter.
router.post("/refresh", validate(refreshSchema), controller.refresh);
router.post("/logout", validate(refreshSchema), controller.logout);
router.post("/verify-email", validate(verifyEmailSchema), controller.verifyEmail);

export default router;
// ==========================================
// END OF FILE: backend/src/modules/auth/auth.routes.ts
// ==========================================