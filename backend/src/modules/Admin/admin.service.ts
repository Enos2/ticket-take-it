// ==========================================
// FILE: backend/src/modules/admin/admin.service.ts
// PURPOSE: Admin logic for managing users and sellers.
// ==========================================
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";

export async function getAllUsers() {
  return await prisma.user.findMany({
    select: { id: true, email: true, fullName: true, role: true, createdAt: true },
    orderBy: { createdAt: 'desc' }
  });
}

export async function getAllSellers() {
  return await prisma.sellerProfile.findMany({
    include: { user: { select: { email: true, fullName: true } } },
    orderBy: { createdAt: 'desc' }
  });
}

export async function updateSellerStatus(sellerId: string, status: "APPROVED" | "REJECTED" | "SUSPENDED") {
  const seller = await prisma.sellerProfile.findUnique({ where: { id: sellerId } });
  if (!seller) throw ApiError.notFound("Seller not found");

  return await prisma.sellerProfile.update({
    where: { id: sellerId },
    data: { status, approvedAt: status === "APPROVED" ? new Date() : null },
  });
}
// ==========================================
// END OF FILE: backend/src/modules/admin/admin.service.ts
// LOCATION: backend/src/modules/admin/admin.service.ts
// LAST UPDATED: October 21, 2026
// ==========================================