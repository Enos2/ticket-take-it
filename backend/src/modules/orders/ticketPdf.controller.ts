// ==========================================
// FILE: backend/src/modules/orders/ticketPdf.controller.ts
// PURPOSE: API handlers that send ticket PDFs.
// ==========================================
import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ApiError } from "../../utils/ApiError";
import { parse } from "../../utils/parse";
import * as service from "./ticketPdf.service";

const ticketParam = z.object({ ticketId: z.string().min(1).max(64) });
const orderParam = z.object({ orderId: z.string().min(1).max(64) });

// The PDF holds the ticket's QR code, so it must never be stored by a browser cache or a proxy.
function sendPdf(res: Response, file: { buffer: Buffer; fileName: string }) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Length", String(file.buffer.length));
  res.send(file.buffer);
}

export async function ticketPdf(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { ticketId } = parse(ticketParam, req.params);
    sendPdf(res, await service.getTicketPdf(req.user.sub, ticketId));
  } catch (err) {
    next(err);
  }
}

export async function orderPdf(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { orderId } = parse(orderParam, req.params);
    sendPdf(res, await service.getOrderTicketsPdf(req.user.sub, orderId));
  } catch (err) {
    next(err);
  }
}
// ==========================================
// END OF FILE: backend/src/modules/orders/ticketPdf.controller.ts
// ==========================================