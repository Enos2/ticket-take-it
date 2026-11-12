-- ==========================================
-- FILE: backend/prisma/migrations/20261111120000_capacity_and_comps/migration.sql
-- PURPOSE: Adds event capacity, held-back tickets and complimentary orders, with database safety checks.
-- ==========================================

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "maxCapacity" INTEGER;

-- AlterTable
ALTER TABLE "TicketType" ADD COLUMN "hostReserved" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "hostIssued" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "isComp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "compIssuedById" TEXT,
ADD COLUMN "compNote" TEXT;

-- Safety nets. The application enforces these rules too; the database refuses anything that slips past.
ALTER TABLE "Event"
ADD CONSTRAINT "Event_maxCapacity_check" CHECK ("maxCapacity" IS NULL OR "maxCapacity" > 0);

ALTER TABLE "TicketType"
ADD CONSTRAINT "TicketType_host_reserve_check"
CHECK ("hostReserved" >= 0 AND "hostIssued" >= 0 AND "hostIssued" <= "hostReserved");

ALTER TABLE "TicketType"
ADD CONSTRAINT "TicketType_stock_check"
CHECK ("sold" + ("hostReserved" - "hostIssued") <= "quantity");
-- ==========================================
-- END OF FILE: backend/prisma/migrations/20261111120000_capacity_and_comps/migration.sql
-- ==========================================