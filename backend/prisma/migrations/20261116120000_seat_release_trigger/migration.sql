-- ==========================================
-- FILE: backend/prisma/migrations/20261116120000_seat_release_trigger/migration.sql
-- PURPOSE: Adds the safety rules for seats that Prisma cannot generate: a seat number check, and a trigger that
--          puts a seat back on sale when its ticket is voided (refund, revoked, event cancelled).
-- ==========================================

-- Safety net: seat numbers start at 1.
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_number_check" CHECK ("number" > 0);

-- When a ticket is voided its seat goes back on sale.
-- Doing it in the database means no code path can forget to free the seat.
CREATE OR REPLACE FUNCTION "release_seat_when_ticket_void"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."status" = 'VOID' AND OLD."status" <> 'VOID' THEN
    UPDATE "Seat" SET "ticketId" = NULL WHERE "ticketId" = NEW."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Ticket_release_seat_when_void" ON "Ticket";

CREATE TRIGGER "Ticket_release_seat_when_void"
AFTER UPDATE OF "status" ON "Ticket"
FOR EACH ROW EXECUTE FUNCTION "release_seat_when_ticket_void"();
-- ==========================================
-- END OF FILE: backend/prisma/migrations/20261116120000_seat_release_trigger/migration.sql
-- ==========================================