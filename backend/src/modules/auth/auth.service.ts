// ==========================================
// FILE: backend/src/modules/auth/auth.service.ts
// PURPOSE: Core login/register logic.
// ==========================================
import { createHash, randomBytes } from "crypto";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";
import { hashPassword, verifyPasswordTimingSafe } from "../../utils/password";
import { signAccessToken } from "../../utils/jwt";
import type { RegisterInput, LoginInput } from "./auth.schema";

interface TokenUser {
  id: string;
  email: string;
  role: Role;
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

// Refresh tokens are stored hashed. The raw token is only ever sent to the client.
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function publicUser(user: { id: string; email: string; fullName: string; role: Role }) {
  return { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
}

async function issueTokens(user: TokenUser, db: Prisma.TransactionClient = prisma) {
  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  const refreshToken = randomBytes(48).toString("hex");

  await db.refreshToken.create({
    data: {
      token: hashToken(refreshToken),
      userId: user.id,
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_MS),
    },
  });

  return { accessToken, refreshToken };
}

export async function register(input: RegisterInput) {
  const email = normalizeEmail(input.email);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw ApiError.conflict("Email already registered");

  let user;
  try {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(input.password),
        fullName: input.fullName,
        phone: input.phone,
      },
    });
  } catch (err) {
    // Two sign-ups with the same email at the same moment: the DB unique index catches the loser.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw ApiError.conflict("Email already registered");
    }
    throw err;
  }

  const tokens = await issueTokens(user);
  return { user: publicUser(user), ...tokens };
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(input.email) } });

  // Always runs a bcrypt compare, even for unknown emails, so timing doesn't reveal who is registered.
  const valid = await verifyPasswordTimingSafe(input.password, user?.passwordHash);
  if (!user || !valid) throw ApiError.unauthorized("Invalid credentials");

  if (!user.isActive) throw ApiError.forbidden("This account has been disabled");

  const tokens = await issueTokens(user);
  return { user: publicUser(user), ...tokens };
}

export async function refresh(refreshToken: string) {
  const record = await prisma.refreshToken.findUnique({
    where: { token: hashToken(refreshToken) },
    include: { user: true },
  });
  if (!record) throw ApiError.unauthorized("Invalid refresh token");

  // A revoked token being presented again suggests it was stolen. Kill every session for that user.
  if (record.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw ApiError.unauthorized("Invalid refresh token");
  }

  if (record.expiresAt < new Date()) throw ApiError.unauthorized("Invalid refresh token");
  if (!record.user.isActive) throw ApiError.unauthorized("Account not found or disabled");

  return await prisma.$transaction(async (tx) => {
    // Guarded revoke: if two requests race with the same token, only one gets count = 1.
    const rotated = await tx.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (rotated.count === 0) throw ApiError.unauthorized("Invalid refresh token");

    const tokens = await issueTokens(record.user, tx);
    return { user: publicUser(record.user), ...tokens };
  });
}

// Revokes one refresh token. Safe to call twice or with an unknown token.
export async function logout(refreshToken: string) {
  await prisma.refreshToken.updateMany({
    where: { token: hashToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// Housekeeping: delete tokens that have expired. Returns how many were removed.
export async function cleanupExpiredRefreshTokens(): Promise<number> {
  const { count } = await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}
// ==========================================
// END OF FILE: backend/src/modules/auth/auth.service.ts
// ==========================================