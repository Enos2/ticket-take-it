// ==========================================
// FILE: backend/src/middleware/auth.middleware.ts
// PURPOSE: JWT Authentication, Role Guard and verified-email guard.
// ==========================================
import { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";
import { verifyAccessToken, AccessTokenPayload } from "../utils/jwt";
import { ApiError } from "../utils/ApiError";
import { prisma } from "../config/database";
import { env } from "../config/env";

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
      emailVerified?: boolean;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return next(ApiError.unauthorized("Missing Authorization header"));
  }

  const token = header.slice(7).trim();
  if (!token) return next(ApiError.unauthorized("Missing token"));

  let payload: AccessTokenPayload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return next(ApiError.unauthorized("Invalid or expired token"));
  }

  try {
    // Load the live user so role changes (e.g. seller onboarding) apply immediately
    // and deactivated accounts are blocked without waiting for the token to expire.
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, isActive: true, emailVerified: true },
    });

    if (!user || !user.isActive) {
      return next(ApiError.unauthorized("Account not found or disabled"));
    }

    req.user = { sub: user.id, email: user.email, role: user.role };
    req.emailVerified = user.emailVerified;
    return next();
  } catch (err) {
    return next(err);
  }
}

export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden("Access denied"));
    return next();
  };
}

// Place after authenticate. Does nothing unless REQUIRE_EMAIL_VERIFICATION is on.
export function requireVerifiedEmail(req: Request, _res: Response, next: NextFunction) {
  if (!env.REQUIRE_EMAIL_VERIFICATION) return next();
  if (!req.user) return next(ApiError.unauthorized());
  if (!req.emailVerified) return next(ApiError.forbidden("Please verify your email address first"));
  return next();
}
// ==========================================
// END OF FILE: backend/src/middleware/auth.middleware.ts
// ==========================================