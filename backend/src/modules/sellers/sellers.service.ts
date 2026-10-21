// ==========================================
// FILE: backend/src/modules/sellers/sellers.service.ts
// PURPOSE: Seller logic for onboarding and viewing orders.
// ==========================================
import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { OnboardSellerInput, SellerOrdersQuery } from "./sellers.schema";

export async function onboardSeller(userId: string, input: OnboardSellerInput) {
  const existing = await prisma.sellerProfile.findUnique({ where: { userId } });
  if (existing) throw ApiError.conflict("Seller profile already exists");

  try {
    return await prisma.$transaction(async (tx) => {
      const profile = await tx.sellerProfile.create({
        data: {
          userId,
          businessName: input.businessName,
          businessEmail: input.businessEmail,
          businessPhone: input.businessPhone,
          status: "PENDING", // an admin must approve before they can publish anything
        },
      });

      // Only promote plain users. Never downgrade an ADMIN.
      await tx.user.updateMany({
        where: { id: userId, role: "USER" },
        data: { role: "SELLER" },
      });

      return profile;
    });
  } catch (err) {
    // Two onboarding requests at the same moment: the unique index on userId catches the loser.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw ApiError.conflict("Seller profile already exists");
    }
    throw err;
  }
}

export async function getSellerProfile(userId: string) {
  const profile = await prisma.sellerProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      businessName: true,
      businessEmail: true,
      businessPhone: true,
      status: true,
      approvedAt: true,
      createdAt: true,
    },
  });
  if (!profile) throw ApiError.notFound("Seller profile not found");
  return profile;
}

export async function getSellerOrders(userId: string, role: Role, query: SellerOrdersQuery) {
  const { page, limit, status } = query;

  let where: Prisma.OrderItemWhereInput = {};

  if (role !== "ADMIN") {
    const seller = await prisma.sellerProfile.findUnique({ where: { userId } });
    if (!seller) throw ApiError.forbidden("Seller profile not found");
    where = { ticketType: { event: { sellerId: seller.id } } };
  }

  if (status) where = { ...where, order: { status } };

  const [items, total] = await prisma.$transaction([
    prisma.orderItem.findMany({
      where,
      include: {
        order: { select: { reference: true, status: true, createdAt: true, paidAt: true } },
        ticketType: {
          select: { name: true, currency: true, event: { select: { title: true, slug: true } } },
        },
      },
      orderBy: { order: { createdAt: "desc" } },
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.orderItem.count({ where }),
  ]);

  return { items, total, page, limit };
}
// ==========================================
// END OF FILE: backend/src/modules/sellers/sellers.service.ts
// ==========================================