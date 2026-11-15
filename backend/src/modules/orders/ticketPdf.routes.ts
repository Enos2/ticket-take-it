// ==========================================
// FILE: backend/src/modules/orders/ticketPdf.routes.ts
// PURPOSE: Routes for downloading tickets as PDF: /tickets
// ==========================================
import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import * as controller from "./ticketPdf.controller";

const router = Router();

router.use(authenticate); // only signed-in people can download tickets

router.get("/order/:orderId/pdf", controller.orderPdf); // every ticket I still hold from an order
router.get("/:ticketId/pdf", controller.ticketPdf); // one ticket

export default router;
// ==========================================
// END OF FILE: backend/src/modules/orders/ticketPdf.routes.ts
// ==========================================