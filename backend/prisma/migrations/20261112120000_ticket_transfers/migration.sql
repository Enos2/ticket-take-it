-- ==========================================
-- FILE: backend/prisma/migrations/20261112120000_ticket_transfers/migration.sql
-- PURPOSE: Adds ticket transfers between people.
-- ==========================================

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "transferCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TicketTransfer" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "toUserId" TEXT,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketTransfer_toEmail_status_idx" ON "TicketTransfer"("toEmail", "status");

-- CreateIndex
CREATE INDEX "TicketTransfer_fromUserId_status_idx" ON "TicketTransfer"("fromUserId", "status");

-- CreateIndex
CREATE INDEX "TicketTransfer_ticketId_idx" ON "TicketTransfer"("ticketId");

-- CreateIndex
CREATE INDEX "TicketTransfer_status_expiresAt_idx" ON "TicketTransfer"("status", "expiresAt");

-- A ticket can only have ONE open transfer at a time. The database enforces it, so two requests at once cannot both win.
CREATE UNIQUE INDEX "TicketTransfer_one_pending_per_ticket" ON "TicketTransfer"("ticketId") WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "TicketTransfer" ADD CONSTRAINT "TicketTransfer_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTransfer" ADD CONSTRAINT "TicketTransfer_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTransfer" ADD CONSTRAINT "TicketTransfer_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- ==========================================
-- END OF FILE: backend/prisma/migrations/20261112120000_ticket_transfers/migration.sql
-- ==========================================