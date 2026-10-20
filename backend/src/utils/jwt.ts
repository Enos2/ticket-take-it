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

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = { expiresIn: env.JWT_ACCESS_EXPIRES as SignOptions["expiresIn"] };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}
// ==========================================
// END OF FILE: backend/src/utils/jwt.ts
// LOCATION: backend/src/utils/jwt.ts
// LAST UPDATED: October 19, 2026
// ==========================================