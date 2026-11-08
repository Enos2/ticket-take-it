// ==========================================
// FILE: backend/src/modules/users/users.service.ts
// PURPOSE: A person's own profile: reading it, editing it, and deleting the account.
// ==========================================
import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { logger } from "../../utils/logger";
import { hashPassword, verifyPassword } from "../../utils/password";
import type { UpdateProfileInput } from "./users.schema";

const profileSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  role: true,
  emailVerified: true,
  createdAt: true,
  sellerProfile: { select: { id: true, businessName: true, status: true } },
} satisfies Prisma.UserSelect;

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: profileSelect });
  if (!user) throw ApiError.notFound("User not found");
  return user;
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.fullName !== undefined && { fullName: input.fullName }),
      ...(input.phone !== undefined && { phone: input.phone }),
    },
  });
  return await getProfile(userId);
}

// Erases what identifies the person and keeps the money records. Orders, payments and the ledger stay,
// because accounting rules usually require it, but they no longer point to a real name or email.
export async function deleteAccount(userId: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, isActive: true, passwordHash: true, sellerProfile: { select: { id: true } } },
  });
  if (!user || !user.isActive) throw ApiError.unauthorized("Account not found or disabled");

  if (user.role === "ADMIN") {
    throw ApiError.badRequest("Administrator accounts can't be deleted here. Ask another administrator for help.");
  }
  // 400, not 401: a wrong password here must not look like an expired session to the app.
  if (!(await verifyPassword(password, user.passwordHash))) throw ApiError.badRequest("Your password is incorrect");

  const now = new Date();
  const sellerId = user.sellerProfile?.id;
  const problems: string[] = [];

  const upcomingTickets = await prisma.ticket.count({
    where: { userId, status: "VALID", event: { endsAt: { gt: now }, status: { not: "CANCELLED" } } },
  });
  if (upcomingTickets > 0) {
    problems.push(`you hold ${upcomingTickets} ${upcomingTickets === 1 ? "ticket" : "tickets"} for upcoming events, so use them or ask support for a refund first`);
  }

  const unpaid = await prisma.order.count({
    where: { userId, status: { in: ["PENDING", "RESERVED"] }, reservationExpiresAt: { gt: now } },
  });
  if (unpaid > 0) problems.push("you have an order waiting for payment, so pay for it or cancel it first");

  if (sellerId) {
    const liveEvents = await prisma.event.count({
      where: { sellerId, status: { in: ["PENDING_REVIEW", "PUBLISHED", "SOLD_OUT", "TAKEN_DOWN"] }, endsAt: { gt: now } },
    });
    if (liveEvents > 0) problems.push("you still have events that have not ended, so cancel them or wait until they finish");

    const balances = await prisma.ledgerEntry.groupBy({ by: ["currency"], where: { sellerId }, _sum: { amountCents: true } });
    if (balances.some((b) => (b._sum.amountCents ?? 0) !== 0)) {
      problems.push("your seller account still has a balance, so ask to be paid out first");
    }
  }

  if (problems.length > 0) throw ApiError.badRequest(`Your account can't be deleted yet: ${problems.join("; ")}.`);

  const placeholder = `deleted-${userId}@deleted.invalid`;
  const scrambled = await hashPassword(randomBytes(24).toString("hex")); // nobody can ever sign in again

  await prisma.$transaction(async (tx) => {
    await tx.refreshToken.deleteMany({ where: { userId } });
    await tx.emailToken.deleteMany({ where: { userId } });
    await tx.emailOutbox.deleteMany({ where: { toEmail: user.email } });
    await tx.auditLog.updateMany({ where: { actorId: userId }, data: { actorEmail: null, ip: null } });

    await tx.user.update({
      where: { id: userId },
      data: { email: placeholder, fullName: "Deleted user", phone: null, passwordHash: scrambled, isActive: false, emailVerified: false, deletedAt: now },
    });

    if (sellerId) {
      await tx.event.deleteMany({ where: { sellerId, status: { in: ["DRAFT", "REJECTED"] } } }); // never went on sale
      await tx.sellerProfile.update({
        where: { id: sellerId },
        data: {
          businessName: "Deleted seller",
          businessEmail: placeholder,
          businessPhone: null,
          payoutMethod: null,
          payoutDetails: null,
          payoutUpdatedAt: null,
          status: "SUSPENDED",
        },
      });
    }
  });

  logger.info(`Account ${userId} was deleted by its owner`);
  return { deleted: true as const };
}
// ==========================================
// END OF FILE: backend/src/modules/users/users.service.ts
// ==========================================