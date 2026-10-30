-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('MUSIC', 'NIGHTLIFE', 'ARTS', 'SPORTS', 'CONFERENCE', 'FOOD', 'FAMILY', 'COMMUNITY', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EventStatus" ADD VALUE 'PENDING_REVIEW';
ALTER TYPE "EventStatus" ADD VALUE 'REJECTED';
ALTER TYPE "EventStatus" ADD VALUE 'TAKEN_DOWN';

-- AlterEnum
ALTER TYPE "TicketTier" ADD VALUE 'VVIP';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "category" "EventCategory" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Event_category_idx" ON "Event"("category");
