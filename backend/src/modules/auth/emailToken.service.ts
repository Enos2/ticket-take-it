// ==========================================
// FILE: backend/src/modules/auth/emailToken.service.ts
// PURPOSE: One-time tokens for email verification and password reset.
// ==========================================
import { createHash, randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";

export type EmailTokenType = "VERIFY_EMAIL" | "RESET_PASSWORD";

// Only the hash is stored, so a database leak can't be used to verify or reset anyone.
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const TOKEN_TTL_MS: Record<EmailTokenType, number> = {
  VERIFY_EMAIL: 24 * 60 * 60 * 1000,
  RESET_PASSWORD: 60 * 60 * 1000,
};

// Stops someone from using the forms to flood an inbox.
const COOLDOWN_MS = 60_000;

// Returns the raw token to put in the link, or null if one was sent in the last minute.
export async function createEmailToken(userId: string, type: EmailTokenType): Promise<string | null> {
  const recent = await prisma.emailToken.findFirst({
    where: { userId, type, createdAt: { gt: new Date(Date.now() - COOLDOWN_MS) } },
    select: { id: true },
  });
  if (recent) return null;

  const raw = randomBytes(32).toString("base64url");

  // Only the newest link works: older unused ones are removed.
  await prisma.$transaction([
    prisma.emailToken.deleteMany({ where: { userId, type, usedAt: null } }),
    prisma.emailToken.create({
      data: {
        tokenHash: hashToken(raw),
        type,
        userId,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS[type]),
      },
    }),
  ]);

  return raw;
}

// Marks the token used and returns its user id. Run inside the same transaction as whatever it unlocks,
// so a failure afterwards doesn't burn the link.
export async function consumeEmailToken(
  tx: Prisma.TransactionClient,
  rawToken: string,
  type: EmailTokenType
): Promise<string> {
  const invalid = () => ApiError.badRequest("This link is invalid or has expired");
  const now = new Date();

  const record = await tx.emailToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!record || record.type !== type || record.usedAt || record.expiresAt < now) throw invalid();

  // Guarded: if the link is opened twice at once, only one request wins.
  const claimed = await tx.emailToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: now },
  });
  if (claimed.count === 0) throw invalid();

  return record.userId;
}
// ==========================================
// END OF FILE: backend/src/modules/auth/emailToken.service.ts
// ==========================================