// ==========================================
// FILE: backend/src/modules/auth/auth.service.ts
// PURPOSE: Core login/register logic.
// ==========================================
import { randomBytes } from "crypto";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { hashPassword, verifyPassword } from "../../utils/password";
import { signAccessToken } from "../../utils/jwt";
import type { z } from "zod";
import type { registerSchema, loginSchema } from "./auth.schema";

type RegisterInput = z.infer<typeof registerSchema>;
type LoginInput = z.infer<typeof loginSchema>;

async function issueTokens(user: { id: string; email: string; role: any }) {
  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  const refreshToken = randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  
  await prisma.refreshToken.create({
    data: { token: refreshToken, userId: user.id, expiresAt },
  });
  
  return { accessToken, refreshToken };
}

export async function register(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw ApiError.conflict("Email already registered");

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await hashPassword(input.password),
      fullName: input.fullName,
      phone: input.phone,
    },
  });
  
  const tokens = await issueTokens(user);
  return { user: { id: user.id, email: user.email, role: user.role }, ...tokens };
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw ApiError.unauthorized("Invalid credentials");
  
  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) throw ApiError.unauthorized("Invalid credentials");

  const tokens = await issueTokens(user);
  return { user: { id: user.id, email: user.email, role: user.role }, ...tokens };
}

export async function refresh(refreshToken: string) {
  const record = await prisma.refreshToken.findUnique({ where: { token: refreshToken }, include: { user: true } });
  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw ApiError.unauthorized("Invalid refresh token");
  }

  await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
  return { user: { id: record.user.id, email: record.user.email, role: record.user.role }, ...(await issueTokens(record.user)) };
}
// ==========================================
// END OF FILE: backend/src/modules/auth/auth.service.ts
// LOCATION: backend/src/modules/auth/auth.service.ts
// LAST UPDATED: October 19, 2026
// ==========================================