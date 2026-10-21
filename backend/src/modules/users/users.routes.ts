// ==========================================
// FILE: backend/src/modules/users/users.routes.ts
// PURPOSE: Handles fetching the logged-in user's profile.
// ==========================================
import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import * as controller from "./users.controller";

const router = Router();

router.get("/me", authenticate, controller.getMe);

export default router;
// ==========================================
// END OF FILE: backend/src/modules/users/users.routes.ts
// ==========================================