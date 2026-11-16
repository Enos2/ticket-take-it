-- ==========================================
-- FILE: backend/prisma/migrations/20261114120000_resale/migration.sql
-- PURPOSE: Adds ticket resale: organiser settings, listings and what is owed to resellers.
-- ==========================================

-- CreateEnum
CREATE TYPE "ResaleStatus" AS ENUM ('ACTIVE', 'RESERVED', 'SOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ResalePayoutStatus" AS ENUM ('NONE', 'OWED', 'PAID');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "resaleEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "resaleMaxPercent" INTEGER NOT NULL DEFAULT 100;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "isResale" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ResaleListing" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "faceValueCents" INTEGER NOT NULL,
    "payoutPhone" TEXT NOT NULL,
    "status" "ResaleStatus" NOT NULL DEFAULT 'ACTIVE',
    "buyerId" TEXT,
    "reservedUntil" TIMESTAMP(3),
    "orderId" TEXT,
    "soldAt" TIMESTAMP(3),
    "feeCents" INTEGER,
    "netCents" INTEGER,
    "payoutStatus" "ResalePayoutStatus" NOT NULL DEFAULT 'NONE',
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "payoutReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResaleListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResaleListing_orderId_key" ON "ResaleListing"("orderId");

-- CreateIndex
CREATE INDEX "ResaleListing_ticketId_status_idx" ON "ResaleListing"("ticketId", "status");

-- CreateIndex
CREATE INDEX "ResaleListing_eventId_status_idx" ON "ResaleListing"("eventId", "status");

-- CreateIndex
CREATE INDEX "ResaleListing_sellerId_status_idx" ON "ResaleListing"("sellerId", "status");

-- CreateIndex
CREATE INDEX "ResaleListing_status_payoutStatus_idx" ON "ResaleListing"("status", "payoutStatus");

-- A ticket can only have ONE open listing at a time. The database enforces it, so two requests at once cannot both win.
CREATE UNIQUE INDEX "ResaleListing_one_open_per_ticket" ON "ResaleListing"("ticketId") WHERE "status" IN ('ACTIVE', 'RESERVED');

-- AddForeignKey
ALTER TABLE "ResaleListing" ADD CONSTRAINT "ResaleListing_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResaleListing" ADD CONSTRAINT "ResaleListing_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResaleListing" ADD CONSTRAINT "ResaleListing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResaleListing" ADD CONSTRAINT "ResaleListing_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResaleListing" ADD CONSTRAINT "ResaleListing_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Safety nets
ALTER TABLE "ResaleListing" ADD CONSTRAINT "ResaleListing_price_check" CHECK ("priceCents" > 0);
ALTER TABLE "Event" ADD CONSTRAINT "Event_resaleMaxPercent_check" CHECK ("resaleMaxPercent" BETWEEN 1 AND 200);
-- ==========================================
-- END OF FILE: backend/prisma/migrations/20261114120000_resale/migration.sql
-- ==========================================