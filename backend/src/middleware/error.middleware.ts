// ==========================================
// FILE: backend/src/middleware/error.middleware.ts
// PURPOSE: Global error handler.
// ==========================================
import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { ApiError } from "../utils/ApiError";
import { logger } from "../utils/logger";
import { env } from "../config/env";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return res.status(409).json({ success: false, message: "Duplicate value in database" });
  }
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ success: false, message: err.message });
  }
  logger.error({ err }, "Unhandled error");
  const message = env.NODE_ENV === "production" ? "Internal server error" : (err as Error)?.message;
  return res.status(500).json({ success: false, message });
}
// ==========================================
// END OF FILE: backend/src/middleware/error.middleware.ts
// LOCATION: backend/src/middleware/error.middleware.ts
// LAST UPDATED: October 19, 2026
// ==========================================