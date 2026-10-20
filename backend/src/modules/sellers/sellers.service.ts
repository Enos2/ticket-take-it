// ==========================================
// FILE: backend/src/modules/sellers/sellers.service.ts
// PURPOSE: Creates the SellerProfile and upgrades the user's role.
// ==========================================
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { OnboardSellerInput } from "./sellers.schema";

export async function onboardSeller(userId: string, input: OnboardSellerInput) {
  const existing = await prisma.sellerProfile.findUnique({ where: { userId } });
  if (existing) throw ApiError.conflict("Seller profile already exists");

  // Use a transaction to ensure both the profile and the role update happen together
  return await prisma.$transaction(async (tx) => {
    // 1. Create Seller Profile
    const profile = await tx.sellerProfile.create({
      data: {
        userId,
        businessName: input.businessName,
        businessEmail: input.businessEmail,
        businessPhone: input.businessPhone,
        status: "APPROVED", // Auto-approving for now so you can test immediately
      },
    });

    // 2. Upgrade User Role
    await tx.user.update({
      where: { id: userId },
      data: { role: "SELLER" },
    });

    return profile;
  });
}
// ==========================================
// END OF FILE: backend/src/modules/sellers/sellers.service.ts
// LOCATION: backend/src/modules/sellers/sellers.service.ts
// LAST UPDATED: October 19, 2026
// ==========================================