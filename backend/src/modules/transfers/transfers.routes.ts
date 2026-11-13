// ==========================================
// FILE: backend/src/modules/transfers/transfers.routes.ts
// PURPOSE: Routes for sending, answering and cancelling ticket transfers.
// ==========================================
import { Router } from "express";
import { authenticate, requireVerifiedEmail } from "../../middleware/auth.middleware";
import { transferLimiter } from "../../middleware/rateLimit.middleware";
import { validate } from "../../middleware/validate.middleware";
import { createTransferSchema } from "./transfers.schema";
import * as controller from "./transfers.controller";

const router = Router();

router.use(authenticate); // every transfer route needs a signed-in person

router.get("/", controller.list); // transfers waiting for me + transfers I sent
router.post("/", transferLimiter, requireVerifiedEmail, validate(createTransferSchema), controller.create);

router.post("/:transferId/accept", requireVerifiedEmail, controller.accept);
router.post("/:transferId/decline", controller.decline);
router.post("/:transferId/cancel", controller.cancel);

export default router;
// ==========================================
// END OF FILE: backend/src/modules/transfers/transfers.routes.ts
// ==========================================