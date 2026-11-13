-- ==========================================
-- FILE: backend/prisma/migrations/20261113120000_seating/migration.sql
-- PURPOSE: Adds assigned seating: seat sections, seats and the seats chosen by an order.
-- ==========================================

-- CreateTable
CREATE TABLE "SeatSection" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SeatSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seat" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "row" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "heldByOrderId" TEXT,
    "heldUntil" TIMESTAMP(3),
    "ticketId" TEXT,

    CONSTRAINT "Seat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderSeat" (
    "orderId" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,

    CONSTRAINT "OrderSeat_pkey" PRIMARY KEY ("orderId","seatId")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeatSection_eventId_name_key" ON "SeatSection"("eventId", "name");

-- CreateIndex
CREATE INDEX "SeatSection_ticketTypeId_idx" ON "SeatSection"("ticketTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_ticketId_key" ON "Seat"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_sectionId_row_number_key" ON "Seat"("sectionId", "row", "number");

-- CreateIndex
CREATE INDEX "Seat_eventId_idx" ON "Seat"("eventId");

-- CreateIndex
CREATE INDEX "Seat_heldByOrderId_idx" ON "Seat"("heldByOrderId");

-- CreateIndex
CREATE INDEX "OrderSeat_seatId_idx" ON "OrderSeat"("seatId");

-- AddForeignKey
ALTER TABLE "SeatSection" ADD CONSTRAINT "SeatSection_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatSection" ADD CONSTRAINT "SeatSection_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "SeatSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSeat" ADD CONSTRAINT "OrderSeat_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSeat" ADD CONSTRAINT "OrderSeat_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Safety net: seat numbers start at 1.
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_number_check" CHECK ("number" > 0);

-- When a ticket is voided (refund, revoked, event cancelled) its seat goes back on sale.
-- Doing it in the database means no code path can forget to free the seat.
CREATE OR REPLACE FUNCTION "release_seat_when_ticket_void"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."status" = 'VOID' AND OLD."status" <> 'VOID' THEN
    UPDATE "Seat" SET "ticketId" = NULL WHERE "ticketId" = NEW."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Ticket_release_seat_when_void"
AFTER UPDATE OF "status" ON "Ticket"
FOR EACH ROW EXECUTE FUNCTION "release_seat_when_ticket_void"();
-- ==========================================
-- END OF FILE: backend/prisma/migrations/20261113120000_seating/migration.sql
-- ==========================================