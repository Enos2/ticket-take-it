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

router.post("/register", authLimiter, validate(registerSchema), controller.register);
router.post("/login", authLimiter, validate(loginSchema), controller.login);
router.post("/refresh", authLimiter, validate(refreshSchema), controller.refresh);

export default router;
// ==========================================
// END OF FILE: backend/src/modules/auth/auth.routes.ts
// LOCATION: backend/src/modules/auth/auth.routes.ts
// LAST UPDATED: October 19, 2026
// ==========================================