// ==========================================
// FILE: backend/src/modules/sellers/sellers.service.ts
// PURPOSE: Seller logic for onboarding and viewing orders.
// ==========================================
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { OnboardSellerInput } from "./sellers.schema";

export async function onboardSeller(userId: string, input: OnboardSellerInput) {
  const existing = await prisma.sellerProfile.findUnique({ where: { userId } });
  if (existing) throw ApiError.conflict("Seller profile already exists");

  return await prisma.$transaction(async (tx) => {
    const profile = await tx.sellerProfile.create({
      data: {
        userId,
        businessName: input.businessName,
        businessEmail: input.businessEmail,
        businessPhone: input.businessPhone,
        status: "APPROVED", 
      },
    });
    await tx.user.update({
      where: { id: userId },
      data: { role: "SELLER" },
    });
    return profile;
  });
}

export async function getSellerOrders(userId: string) {
  const seller = await prisma.sellerProfile.findUnique({ where: { userId } });
  if (!seller) throw ApiError.forbidden("Seller profile not found");

  // Fetch all order items that belong to events owned by this seller
  return await prisma.orderItem.findMany({
    where: {
      ticketType: {
        event: { sellerId: seller.id }
      }
    },
    include: {
      order: { select: { reference: true, status: true, createdAt: true } },
      ticketType: { select: { name: true, event: { select: { title: true } } } }
    },
    orderBy: { order: { createdAt: 'desc' } }
  });
}
// ==========================================
// END OF FILE: backend/src/modules/sellers/sellers.service.ts
// LOCATION: backend/src/modules/sellers/sellers.service.ts
// LAST UPDATED: October 21, 2026
// ==========================================