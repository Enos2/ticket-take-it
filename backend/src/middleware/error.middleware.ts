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

function send(res: Response, status: number, message: string) {
  return res.status(status).json({ success: false, message });
}

// express.json() errors (bad JSON, body too large) arrive as plain errors with a `type` and `status`.
function parseBodyParserError(err: unknown): { status: number; message: string } | null {
  if (typeof err !== "object" || err === null) return null;
  const { type, status } = err as { type?: unknown; status?: unknown };
  if (typeof type !== "string" || typeof status !== "number" || status < 400 || status > 499) return null;

  if (type === "entity.parse.failed") return { status: 400, message: "Invalid JSON in request body" };
  if (type === "entity.too.large") return { status: 413, message: "Request body too large" };
  return { status, message: "Invalid request body" };
}

export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);

  if (err instanceof ApiError) {
    if (err.statusCode >= 500) logger.error({ err }, err.message);
    return send(res, err.statusCode, err.message);
  }

  const bodyError = parseBodyParserError(err);
  if (bodyError) return send(res, bodyError.status, bodyError.message);

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002": // unique constraint
        return send(res, 409, "Duplicate value in database");
      case "P2025": // record to update/delete not found
        return send(res, 404, "Record not found");
      case "P2003": // foreign key constraint
        return send(res, 409, "Related record not found or still in use");
      case "P2034": // write conflict or deadlock between concurrent transactions
        logger.warn({ err }, "Transaction conflict");
        return send(res, 409, "This request conflicted with another one. Please try again.");
      case "P2028": // interactive transaction timed out or could not start
        logger.warn({ err }, "Transaction timeout");
        return send(res, 503, "The server is busy. Please try again.");
    }
  }

  // Database unreachable (for example a Neon cold start or outage).
  if (err instanceof Prisma.PrismaClientInitializationError) {
    logger.error({ err }, "Database connection failed");
    return send(res, 503, "Service temporarily unavailable. Please try again.");
  }

  logger.error({ err }, "Unhandled error");
  const message = env.NODE_ENV === "production" ? "Internal server error" : (err as Error)?.message;
  return send(res, 500, message ?? "Internal server error");
}
// ==========================================
// END OF FILE: backend/src/middleware/error.middleware.ts
// ==========================================