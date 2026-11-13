// ==========================================
// FILE: backend/src/routes/index.ts
// PURPOSE: Master router.
// LOCATION: backend/src/routes/index.ts
// ==========================================

import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes";
import usersRoutes from "../modules/users/users.routes";
import sellersRoutes from "../modules/sellers/sellers.routes";
import eventsRoutes from "../modules/events/events.routes";
import ordersRoutes from "../modules/orders/orders.routes";
import transfersRoutes from "../modules/transfers/transfers.routes";
import paymentsRoutes from "../modules/payments/payments.routes";
import checkinRoutes from "../modules/checkin/checkin.routes";
import doorRoutes from "../modules/door/door.routes";
import adminRoutes from "../modules/admin/admin.routes";
import financeRoutes from "../modules/finance/finance.routes";
import systemRoutes from "../modules/system/system.routes";
import receiptsRoutes from "../modules/orders/receipts.routes";
import engagementRoutes from "../modules/engagement/engagement.routes";
import organizersRoutes from "../modules/engagement/organizers.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", usersRoutes);
router.use("/sellers", sellersRoutes);
router.use("/events", eventsRoutes);
router.use("/orders", ordersRoutes);
router.use("/transfers", transfersRoutes);
router.use("/payments", paymentsRoutes);
router.use("/checkin", checkinRoutes);
router.use("/door", doorRoutes);
router.use("/admin", adminRoutes);
router.use("/finance", financeRoutes);
router.use("/system", systemRoutes);
router.use("/receipts", receiptsRoutes);
router.use("/engagement", engagementRoutes);
router.use("/organizers", organizersRoutes);

export default router;

// ==========================================
// END OF FILE: backend/src/routes/index.ts
// ==========================================