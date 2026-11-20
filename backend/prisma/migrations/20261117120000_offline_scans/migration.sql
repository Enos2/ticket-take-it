-- ==========================================
-- FILE: backend/prisma/migrations/20261117120000_offline_scans/migration.sql
-- PURPOSE: Adds offline gate scanning: a record of every scan a phone made without internet and uploaded later.
-- ==========================================

-- CreateEnum
CREATE TYPE "OfflineScanOutcome" AS ENUM ('ADMITTED', 'ALREADY_USED', 'UNKNOWN_TICKET', 'WRONG_EVENT', 'TICKET_VOIDED', 'WRONG_GATE');

-- CreateTable
CREATE TABLE "OfflineScan" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "scannedById" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ticketId" TEXT,
    "gateId" TEXT,
    "outcome" "OfflineScanOutcome" NOT NULL,
    "detail" TEXT,

    CONSTRAINT "OfflineScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OfflineScan_eventId_clientId_key" ON "OfflineScan"("eventId", "clientId");

-- CreateIndex
CREATE INDEX "OfflineScan_eventId_outcome_idx" ON "OfflineScan"("eventId", "outcome");

-- AddForeignKey
ALTER TABLE "OfflineScan" ADD CONSTRAINT "OfflineScan_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- ==========================================
-- END OF FILE: backend/prisma/migrations/20261117120000_offline_scans/migration.sql
-- ==========================================