// ==========================================
// FILE: backend/src/utils/jwt.ts
// PURPOSE: Creating and verifying JSON Web Tokens.
// ==========================================
import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import { Role } from "@prisma/client";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
}

// Pin the algorithm so tokens signed any other way are rejected.
const ALGORITHM = "HS256" as const;

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    algorithm: ALGORITHM,
    expiresIn: env.JWT_ACCESS_EXPIRES as SignOptions["expiresIn"],
  };
  return jwt.sign(
    { sub: payload.sub, email: payload.email, role: payload.role },
    env.JWT_ACCESS_SECRET,
    options
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: [ALGORITHM] });

  if (typeof decoded === "string" || !decoded.sub || !decoded.email || !decoded.role) {
    throw new Error("Malformed token payload");
  }

  return {
    sub: decoded.sub,
    email: decoded.email as string,
    role: decoded.role as Role,
  };
}
// ==========================================
// END OF FILE: backend/src/utils/jwt.ts
// ==========================================