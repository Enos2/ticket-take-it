// ==========================================
// FILE: backend/src/routes/index.ts
// PURPOSE: Master router.
// ==========================================
import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes";
import usersRoutes from "../modules/users/users.routes";
import sellersRoutes from "../modules/sellers/sellers.routes";
import eventsRoutes from "../modules/events/events.routes";
import ordersRoutes from "../modules/orders/orders.routes";
import paymentsRoutes from "../modules/payments/payments.routes";
import checkinRoutes from "../modules/checkin/checkin.routes";
import adminRoutes from "../modules/Admin/admin.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", usersRoutes);
router.use("/sellers", sellersRoutes);
router.use("/events", eventsRoutes);
router.use("/orders", ordersRoutes);
router.use("/payments", paymentsRoutes);
router.use("/checkin", checkinRoutes);
router.use("/admin", adminRoutes);

export default router;
// ==========================================
// END OF FILE: backend/src/routes/index.ts
// ==========================================