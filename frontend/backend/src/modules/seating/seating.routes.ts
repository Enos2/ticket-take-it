// ==========================================
// FILE: backend/src/modules/seating/seating.routes.ts
// PURPOSE: Routes for seat maps and layouts: /events/:eventId/seating
// ==========================================
import { Router } from "express";
import { authenticate, authorize } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { blockSeatsSchema, giveSeatsSchema, saveLayoutSchema } from "./seating.schema";
import * as controller from "./seating.controller";

const router = Router({ mergeParams: true }); // mergeParams gives access to :eventId from the parent route

const manage = [authenticate, authorize("SELLER", "ADMIN")];

// Public: which seats can be chosen
router.get("/map", controller.publicMap);

// Seller / admin
router.get("/", ...manage, controller.manageMap); // the full map, including blocked and given seats
router.put("/", ...manage, validate(saveLayoutSchema), controller.save); // replaces the whole layout
router.delete("/", ...manage, controller.remove);
router.post("/block", ...manage, validate(blockSeatsSchema), controller.block); // keep seats off sale, or put them back
router.post("/give", ...manage, validate(giveSeatsSchema), controller.give); // give blocked seats to a guest

export default router;
// ==========================================
// END OF FILE: backend/src/modules/seating/seating.routes.ts
// ==========================================