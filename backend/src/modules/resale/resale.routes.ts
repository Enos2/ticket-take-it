// ==========================================
// FILE: backend/src/modules/resale/resale.routes.ts
// PURPOSE: Routes for ticket resale: /resale
// ==========================================
import { Router } from "express";
import { authenticate, authorize, requireVerifiedEmail } from "../../middleware/auth.middleware";
import { paymentLimiter } from "../../middleware/rateLimit.middleware";
import { validate } from "../../middleware/validate.middleware";
import { createListingSchema, markPaidSchema, resaleSettingsSchema } from "./resale.schema";
import * as controller from "./resale.controller";

const router = Router();

const manage = [authenticate, authorize("SELLER", "ADMIN")];

// Public: the tickets offered for an event
router.get("/events/:eventId", controller.eventListings);

// Organiser: allow resale and set the highest price
router.get("/events/:eventId/settings", ...manage, controller.getSettings);
router.put("/events/:eventId/settings", ...manage, validate(resaleSettingsSchema), controller.updateSettings);

// Admin: pay the people who sold tickets
router.get("/admin/owed", authenticate, authorize("ADMIN"), controller.owed);
router.post("/admin/listings/:listingId/paid", authenticate, authorize("ADMIN"), validate(markPaidSchema), controller.markPaid);

// Signed-in people: sell and buy
router.get("/mine", authenticate, controller.mine);
router.post("/listings", authenticate, requireVerifiedEmail, validate(createListingSchema), controller.createListing);
router.delete("/listings/:listingId", authenticate, controller.cancelListing);
router.post("/listings/:listingId/buy", authenticate, requireVerifiedEmail, paymentLimiter, controller.buy);

export default router;
// ==========================================
// END OF FILE: backend/src/modules/resale/resale.routes.ts
// ==========================================