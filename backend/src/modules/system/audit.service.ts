// ==========================================
// FILE: backend/src/modules/system/audit.service.ts
// PURPOSE: The audit log: a permanent record of who did what.
// ==========================================
import { Prisma } from "@prisma/client";
import type { Request } from "express";
import { prisma } from "../../config/database";
import { logger } from "../../utils/logger";
import { Pagination, skipTake } from "../../utils/pagination";

export interface AuditInput {
  action: string; // for example "event.approve"
  targetType?: string;
  targetId?: string;
  summary: string;
  // Never put passwords, tokens, ticket codes or payout details in here.
  metadata?: Prisma.InputJsonObject;
}

// Never throws. If the log can't be written, the action that was just done still stands, and the problem is logged.
export async function audit(req: Request, input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: req.user?.sub ?? null,
        actorEmail: req.user?.email ?? null,
        actorRole: req.user?.role ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        summary: input.summary.slice(0, 300),
        metadata: input.metadata,
        ip: req.ip ?? null,
      },
    });
  } catch (err) {
    logger.error({ err }, `Could not write the audit log for ${input.action}`);
  }
}

export async function listAudit(pagination: Pagination, filters: { q?: string; action?: string }) {
  const insensitive = Prisma.QueryMode.insensitive;

  const where: Prisma.AuditLogWhereInput = {
    ...(filters.action && { action: { startsWith: filters.action } }),
    ...(filters.q && {
      OR: [
        { summary: { contains: filters.q, mode: insensitive } },
        { actorEmail: { contains: filters.q, mode: insensitive } },
        { targetId: filters.q },
      ],
    }),
  };

  const [items, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      select: {
        id: true,
        actorEmail: true,
        actorRole: true,
        action: true,
        targetType: true,
        targetId: true,
        summary: true,
        ip: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...skipTake(pagination),
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, total, page: pagination.page, limit: pagination.limit };
}
// ==========================================
// END OF FILE: backend/src/modules/system/audit.service.ts
// ==========================================