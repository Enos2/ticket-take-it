// ==========================================
// FILE: backend/src/modules/finance/finance.routes.ts
// PURPOSE: Seller earnings and payout details, and the admin payout tools. Money changes are audited.
// ==========================================
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate, authorize } from "../../middleware/auth.middleware";
import { authLimiter } from "../../middleware/rateLimit.middleware";
import { parse } from "../../utils/parse";
import { paginationSchema } from "../../utils/pagination";
import { audit } from "../system/audit.service";
import * as earnings from "./earnings.service";
import * as payouts from "./payout.service";

const router = Router();

const idParam = z.object({ id: z.string().min(1).max(64) });

const ledgerQuery = paginationSchema.extend({
  type: z.enum(["SALE", "FEE", "REFUND", "FEE_REFUND", "PAYOUT"]).optional(),
});

const payoutDetailsBody = z.object({
  method: z.enum(["MPESA", "BANK"]),
  details: z.string().trim().min(5).max(300),
  password: z.string().min(1).max(128),
});

const balancesQuery = paginationSchema.extend({ onlyDue: z.enum(["true", "false"]).optional() });

const payoutsQuery = paginationSchema.extend({ sellerId: z.string().min(1).max(64).optional() });

const payoutBody = z.object({
  sellerId: z.string().min(1).max(64),
  currency: z.string().trim().length(3).toUpperCase(),
  amountCents: z.number().int().positive().max(1_000_000_000).optional(),
  method: z.enum(["MPESA", "BANK", "OTHER"]),
  reference: z.string().trim().max(100).optional(),
  note: z.string().trim().max(500).optional(),
});

const feeBody = z.object({ feeBps: z.number().int().min(0).max(5000).nullable() });

// Forwards async errors to the error middleware (Express 4 does not do this on its own).
const handle =
  (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

router.use(authenticate);

// ------------------------------------------------------------------ sellers

router.get("/earnings", authorize("SELLER"), handle(async (req, res) => {
  res.json({ success: true, data: await earnings.getEarnings(req.user!.sub) });
}));

router.get("/ledger", authorize("SELLER"), handle(async (req, res) => {
  const { type, ...pagination } = parse(ledgerQuery, req.query);
  const { items, total, page, limit } = await earnings.getLedger(req.user!.sub, pagination, type);
  res.json({ success: true, data: items, meta: { total, page, limit } });
}));

router.get("/payouts", authorize("SELLER"), handle(async (req, res) => {
  const { items, total, page, limit } = await earnings.getSellerPayouts(req.user!.sub, parse(paginationSchema, req.query));
  res.json({ success: true, data: items, meta: { total, page, limit } });
}));

// Strictly rate limited, because it checks the password.
router.patch("/payout-details", authorize("SELLER"), authLimiter, handle(async (req, res) => {
  const body = parse(payoutDetailsBody, req.body);
  const data = await earnings.setPayoutDetails(req.user!.sub, body);
  // The log says that the details changed, never what they changed to.
  await audit(req, {
    action: "seller.payout_details",
    targetType: "user",
    targetId: req.user!.sub,
    summary: "Changed payout details",
    metadata: { method: body.method },
  });
  res.json({ success: true, data });
}));

// ------------------------------------------------------------------- admins

router.get("/admin/balances", authorize("ADMIN"), handle(async (req, res) => {
  const { onlyDue, ...pagination } = parse(balancesQuery, req.query);
  const { total, page, limit, ...data } = await payouts.listSellerBalances(pagination, onlyDue === "true");
  res.json({ success: true, data, meta: { total, page, limit } });
}));

router.get("/admin/payouts", authorize("ADMIN"), handle(async (req, res) => {
  const { sellerId, ...pagination } = parse(payoutsQuery, req.query);
  const { items, total, page, limit } = await payouts.listPayouts(pagination, sellerId);
  res.json({ success: true, data: items, meta: { total, page, limit } });
}));

router.post("/admin/payouts", authorize("ADMIN"), handle(async (req, res) => {
  const body = parse(payoutBody, req.body);
  const data = await payouts.recordPayout(req.user!.sub, body);
  await audit(req, {
    action: "payout.record",
    targetType: "seller",
    targetId: data.sellerId,
    summary: `Recorded a payout of ${(data.amountCents / 100).toFixed(2)} ${data.currency}`,
    metadata: { method: data.method, reference: data.reference ?? null, amountCents: data.amountCents },
  });
  res.status(201).json({ success: true, data });
}));

router.patch("/admin/sellers/:id/fee", authorize("ADMIN"), handle(async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { feeBps } = parse(feeBody, req.body);
  const data = await payouts.setSellerFee(id, feeBps);
  await audit(req, {
    action: "seller.fee",
    targetType: "seller",
    targetId: id,
    summary: `Set commission for "${data.businessName}" to ${feeBps === null ? "the default" : `${feeBps / 100}%`}`,
    metadata: { feeBps },
  });
  res.json({ success: true, data });
}));

export default router;
// ==========================================
// END OF FILE: backend/src/modules/finance/finance.routes.ts
// ==========================================