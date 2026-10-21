// ==========================================
// FILE: backend/src/modules/admin/admin.service.ts
// PURPOSE: Admin logic for managing users and sellers.
// ==========================================
import type { SellerProfile } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";

type SellerStatus = SellerProfile["status"];

interface Pagination {
  page?: number;
  limit?: number;
}

function paginate({ page = 1, limit = 20 }: Pagination = {}) {
  const take = Math.min(Math.max(limit, 1), 100);
  const skip = (Math.max(page, 1) - 1) * take;
  return { take, skip };
}

export async function getAllUsers(pagination?: Pagination) {
  const { take, skip } = paginate(pagination);

  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      select: { id: true, email: true, fullName: true, role: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    prisma.user.count(),
  ]);

  return { items, total, page: Math.floor(skip / take) + 1, limit: take };
}

export async function getAllSellers(pagination?: Pagination) {
  const { take, skip } = paginate(pagination);

  const [items, total] = await prisma.$transaction([
    prisma.sellerProfile.findMany({
      include: { user: { select: { email: true, fullName: true } } },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    prisma.sellerProfile.count(),
  ]);

  return { items, total, page: Math.floor(skip / take) + 1, limit: take };
}

export async function updateSellerStatus(sellerId: string, status: SellerStatus) {
  const seller = await prisma.sellerProfile.findUnique({ where: { id: sellerId } });
  if (!seller) throw ApiError.notFound("Seller not found");

  return await prisma.sellerProfile.update({
    where: { id: sellerId },
    data: {
      status,
      // Only stamp on approval; leave the original date intact otherwise.
      ...(status === "APPROVED" && { approvedAt: new Date() }),
    },
  });
}
// ==========================================
// END OF FILE: backend/src/modules/admin/admin.service.ts
// ==========================================