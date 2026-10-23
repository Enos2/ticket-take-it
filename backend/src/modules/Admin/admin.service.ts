// ==========================================
// FILE: backend/src/modules/admin/admin.service.ts
// PURPOSE: Admin logic for managing users, sellers, events and orders.
// ==========================================
import { Prisma, EventStatus, OrderStatus, SellerProfile } from "@prisma/client";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";
import { background } from "../../utils/background";
import { Pagination, skipTake } from "../../utils/pagination";
import { notifySellerStatusChanged } from "../notifications/notifications.service";

type SellerStatus = SellerProfile["status"];

export async function getAllUsers(pagination: Pagination) {
  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      select: { id: true, email: true, fullName: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      ...skipTake(pagination),
    }),
    prisma.user.count(),
  ]);

  return { items, total, page: pagination.page, limit: pagination.limit };
}

export async function getAllSellers(pagination: Pagination) {
  const [items, total] = await prisma.$transaction([
    prisma.sellerProfile.findMany({
      include: { user: { select: { email: true, fullName: true } } },
      orderBy: { createdAt: "desc" },
      ...skipTake(pagination),
    }),
    prisma.sellerProfile.count(),
  ]);

  return { items, total, page: pagination.page, limit: pagination.limit };
}

export async function updateSellerStatus(sellerId: string, status: SellerStatus) {
  const seller = await prisma.sellerProfile.findUnique({ where: { id: sellerId } });
  if (!seller) throw ApiError.notFound("Seller not found");

  const updated = await prisma.sellerProfile.update({
    where: { id: sellerId },
    data: {
      status,
      // Only stamp on approval; leave the original date intact otherwise.
      ...(status === "APPROVED" && { approvedAt: new Date() }),
    },
  });

  if (seller.status !== status) background(notifySellerStatusChanged(sellerId), "seller status email");
  return updated;
}

// Activating or deactivating an account. Deactivation also ends all of that user's sessions.
export async function setUserActive(adminId: string, userId: string, isActive: boolean) {
  if (adminId === userId) throw ApiError.badRequest("You cannot change your own account status");

  return await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw ApiError.notFound("User not found");

    const updated = await tx.user.update({
      where: { id: userId },
      data: { isActive },
      select: { id: true, email: true, fullName: true, role: true, isActive: true },
    });

    if (!isActive) {
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return updated;
  });
}

export async function getAllEvents(pagination: Pagination, status?: EventStatus) {
  const where: Prisma.EventWhereInput = status ? { status } : {};

  const [items, total] = await prisma.$transaction([
    prisma.event.findMany({
      where,
      include: {
        seller: { select: { id: true, businessName: true, status: true } },
        ticketTypes: { select: { quantity: true, sold: true } },
      },
      orderBy: { createdAt: "desc" },
      ...skipTake(pagination),
    }),
    prisma.event.count({ where }),
  ]);

  return { items, total, page: pagination.page, limit: pagination.limit };
}

export async function getAllOrders(
  pagination: Pagination,
  filters: { status?: OrderStatus; eventId?: string; userId?: string }
) {
  const where: Prisma.OrderWhereInput = {
    ...(filters.status && { status: filters.status }),
    ...(filters.userId && { userId: filters.userId }),
    ...(filters.eventId && { items: { some: { ticketType: { eventId: filters.eventId } } } }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      include: {
        user: { select: { email: true, fullName: true } },
        items: {
          select: {
            quantity: true,
            subtotalCents: true,
            ticketType: { select: { name: true, event: { select: { id: true, title: true } } } },
          },
        },
        _count: { select: { tickets: true } },
      },
      orderBy: { createdAt: "desc" },
      ...skipTake(pagination),
    }),
    prisma.order.count({ where }),
  ]);

  return { items, total, page: pagination.page, limit: pagination.limit };
}

export async function getStats() {
  const [users, pendingSellers, events, publishedEvents, paidOrders, ticketsIssued, revenue, needsRefund] =
    await Promise.all([
      prisma.user.count(),
      prisma.sellerProfile.count({ where: { status: "PENDING" } }),
      prisma.event.count(),
      prisma.event.count({ where: { status: "PUBLISHED" } }),
      prisma.order.count({ where: { status: "PAID" } }),
      prisma.ticket.count({ where: { status: { not: "VOID" } } }),
      prisma.order.groupBy({ by: ["currency"], where: { status: "PAID" }, _sum: { totalCents: true } }),
      prisma.payment.count({ where: { status: "SUCCEEDED", metadata: { path: ["needsRefund"], equals: true } } }),
    ]);

  return {
    users,
    pendingSellers,
    events,
    publishedEvents,
    paidOrders,
    ticketsIssued,
    paymentsNeedingRefund: needsRefund,
    // One entry per currency. Amounts in cents.
    revenue: revenue.map((r) => ({ currency: r.currency, totalCents: r._sum.totalCents ?? 0 })),
  };
}
// ==========================================
// END OF FILE: backend/src/modules/admin/admin.service.ts
// ==========================================