// ==========================================
// FILE: backend/src/middleware/auth.middleware.ts
// PURPOSE: JWT Authentication and Role Guard.
// ==========================================
import { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";
import { verifyAccessToken, AccessTokenPayload } from "../utils/jwt";
import { ApiError } from "../utils/ApiError";

declare global {
  namespace Express {
    interface Request { user?: AccessTokenPayload; }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return next(ApiError.unauthorized("Missing Authorization header"));
  }
  try {
    req.user = verifyAccessToken(header.slice(7));
    return next();
  } catch {
    return next(ApiError.unauthorized("Invalid or expired token"));
  }
}

export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden("Access denied"));
    return next();
  };
}
// ==========================================
// END OF FILE: backend/src/middleware/auth.middleware.ts
// LOCATION: backend/src/middleware/auth.middleware.ts
// LAST UPDATED: October 19, 2026
// ==========================================