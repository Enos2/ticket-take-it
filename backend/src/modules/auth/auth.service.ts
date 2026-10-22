// ==========================================
// FILE: backend/src/modules/auth/auth.service.ts
// PURPOSE: Core login/register logic, email verification and password flows.
// ==========================================
import { createHash, randomBytes } from "crypto";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";
import { background } from "../../utils/background";
import { sendEmail } from "../../utils/email";
import { appLink, verifyEmailEmail, resetPasswordEmail } from "../../utils/emailTemplates";
import { hashPassword, verifyPassword, verifyPasswordTimingSafe } from "../../utils/password";
import { signAccessToken } from "../../utils/jwt";
import { createEmailToken, consumeEmailToken } from "./emailToken.service";
import type { RegisterInput, LoginInput } from "./auth.schema";

interface TokenUser {
  id: string;
  email: string;
  role: Role;
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

// Refresh tokens are stored hashed. The raw token is only ever sent to the client.
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function publicUser(user: { id: string; email: string; fullName: string; role: Role; emailVerified: boolean }) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    emailVerified: user.emailVerified,
  };
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

// ------------------------------------------------------------------ emails

interface MailUser {
  id: string;
  email: string;
  fullName: string;
}

async function deliverVerification(user: MailUser, token: string) {
  const url = appLink(`/verify-email?token=${encodeURIComponent(token)}`);
  await sendEmail({ to: user.email, ...verifyEmailEmail(user.fullName, url) });
}

async function sendVerificationEmail(user: MailUser) {
  const token = await createEmailToken(user.id, "VERIFY_EMAIL");
  if (token) await deliverVerification(user, token); // null = one was sent in the last minute
}

async function sendPasswordResetEmail(user: MailUser) {
  const token = await createEmailToken(user.id, "RESET_PASSWORD");
  if (!token) return;

  const url = appLink(`/reset-password?token=${encodeURIComponent(token)}`);
  await sendEmail({ to: user.email, ...resetPasswordEmail(user.fullName, url) });
}

// ---------------------------------------------------------------- accounts

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
  background(sendVerificationEmail(user), "verification email");
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

// ---------------------------------------------------- verification and reset

export async function verifyEmail(rawToken: string) {
  await prisma.$transaction(async (tx) => {
    const userId = await consumeEmailToken(tx, rawToken, "VERIFY_EMAIL");
    await tx.user.update({ where: { id: userId }, data: { emailVerified: true } });
  });
}

export async function resendVerification(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, fullName: true, emailVerified: true, isActive: true },
  });
  if (!user || !user.isActive) throw ApiError.unauthorized("Account not found or disabled");
  if (user.emailVerified) throw ApiError.badRequest("Your email is already verified");

  const token = await createEmailToken(user.id, "VERIFY_EMAIL");
  if (!token) throw ApiError.tooManyRequests("Please wait a minute before requesting another email");

  await deliverVerification(user, token);
}

// Always returns without saying whether the email exists, so it can't be used to find registered accounts.
export async function forgotPassword(rawEmail: string) {
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(rawEmail) } });
  if (!user || !user.isActive) return;

  background(sendPasswordResetEmail(user), "password reset email");
}

export async function resetPassword(rawToken: string, newPassword: string) {
  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    const userId = await consumeEmailToken(tx, rawToken, "RESET_PASSWORD");

    const user = await tx.user.findUnique({ where: { id: userId }, select: { isActive: true } });
    if (!user?.isActive) throw ApiError.badRequest("This link is invalid or has expired");

    const now = new Date();
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });

    // Everyone signed in with the old password is signed out, and any other reset links die.
    await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
    await tx.emailToken.updateMany({
      where: { userId, type: "RESET_PASSWORD", usedAt: null },
      data: { usedAt: now },
    });
  });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) throw ApiError.unauthorized("Account not found or disabled");

  // 400, not 401: a wrong password here must not look like an expired session to the frontend.
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw ApiError.badRequest("Current password is incorrect");
  }

  const passwordHash = await hashPassword(newPassword);

  return await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });

    // Every other device is signed out. This one gets fresh tokens.
    await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });

    const tokens = await issueTokens(user, tx);
    return { user: publicUser(user), ...tokens };
  });
}

// Housekeeping: delete tokens that have expired. Returns how many were removed.
export async function cleanupExpiredRefreshTokens(): Promise<number> {
  const now = new Date();
  const [refresh, email] = await prisma.$transaction([
    prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.emailToken.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  return refresh.count + email.count;
}
// ==========================================
// END OF FILE: backend/src/modules/auth/auth.service.ts
// ==========================================