// ==========================================
// FILE: backend/src/modules/auth/auth.routes.ts
// PURPOSE: Connects endpoints to controllers.
// ==========================================
import { Router } from "express";
import { validate } from "../../middleware/validate.middleware";
import { authLimiter } from "../../middleware/rateLimit.middleware";
import { registerSchema, loginSchema, refreshSchema } from "./auth.schema";
import * as controller from "./auth.controller";

const router = Router();

// Strict limiter: these endpoints can be brute-forced.
router.post("/register", authLimiter, validate(registerSchema), controller.register);
router.post("/login", authLimiter, validate(loginSchema), controller.login);

// Refresh and logout use high-entropy tokens, so they only fall under the general API limiter.
router.post("/refresh", validate(refreshSchema), controller.refresh);
router.post("/logout", validate(refreshSchema), controller.logout);

export default router;
// ==========================================
// END OF FILE: backend/src/modules/auth/auth.routes.ts
// ==========================================