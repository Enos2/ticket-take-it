// ==========================================
// FILE: backend/src/modules/users/users.service.ts
// PURPOSE: User profile logic.
// ==========================================
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      role: true,
      emailVerified: true,
      createdAt: true,
      sellerProfile: { select: { id: true, businessName: true, status: true } },
    },
  });

  if (!user) throw ApiError.notFound("User not found");
  return user;
}
// ==========================================
// END OF FILE: backend/src/modules/users/users.service.ts
// ==========================================