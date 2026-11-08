// ==========================================
// FILE: backend/src/modules/users/users.routes.ts
// PURPOSE: A person's own profile: view, edit and delete.
// ==========================================
import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { authLimiter } from "../../middleware/rateLimit.middleware";
import { validate } from "../../middleware/validate.middleware";
import * as controller from "./users.controller";
import { deleteAccountSchema, updateProfileSchema } from "./users.schema";

const router = Router();

router.get("/me", authenticate, controller.getMe);
router.patch("/me", authenticate, validate(updateProfileSchema), controller.updateMe);

// Checks the password, so it is rate limited like login. A POST, not a DELETE, so the password travels in the body.
router.post("/me/delete", authenticate, authLimiter, validate(deleteAccountSchema), controller.deleteMe);

export default router;
// ==========================================
// END OF FILE: backend/src/modules/users/users.routes.ts
// ==========================================