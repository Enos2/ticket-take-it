// ==========================================
// FILE: backend/tests/entry-rules.test.ts
// PURPOSE: The door's time window, the VVIP ticket type, and ticket locking while an event is in review.
// ==========================================
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/config/database";
import { api, authHeader, createEventWithTicket, createSeller, createUser, inDays, placeOrder, resetDb } from "./helpers";

beforeEach(resetDb);

const HOUR = 60 * 60 * 1000;

type Actor = { id: string; email: string; role: "USER" | "SELLER" | "ADMIN" };

// A seller with a free ticket held by a buyer. The event is then moved on the calendar.
async function ticketForEventStartingIn(hours: number, durationHours = 3) {
  const seller = await createSeller();
  const { event, ticket } = await createEventWithTicket({ sellerProfileId: seller.profile.id, priceCents: 0, quantity: 10 });
  const buyer = await createUser("USER");

  const bought = await placeOrder(buyer, [{ ticketTypeId: ticket.id, quantity: 1 }]);
  expect(bought.status).toBe(201);
  const code = bought.body.data.tickets[0].code as string;

  await prisma.event.update({
    where: { id: event.id },
    data: {
      startsAt: new Date(Date.now() + hours * HOUR),
      endsAt: new Date(Date.now() + (hours + durationHours) * HOUR),
    },
  });
  return { seller, code };
}

const scan = (user: Actor, code: string) => api().post("/api/v1/checkin").set(authHeader(user)).send({ code });

describe("check-in window", () => {
  it("refuses a seller's scan long before the event, but lets an admin through", async () => {
    const { seller, code } = await ticketForEventStartingIn(48);
    const admin = await createUser("ADMIN");

    const early = await scan(seller.user, code);
    expect(early.status).toBe(409);
    expect(early.body.message).toMatch(/opens at/);

    expect((await scan(admin, code)).status).toBe(200); // the ticket was not used up by the refused scan
  });

  it("accepts scans from 12 hours before the start and while the event runs", async () => {
    const soon = await ticketForEventStartingIn(10);
    expect((await scan(soon.seller.user, soon.code)).status).toBe(200);

    const running = await ticketForEventStartingIn(-1);
    expect((await scan(running.seller.user, running.code)).status).toBe(200);
  });

  it("closes 6 hours after the event ends", async () => {
    const { seller, code } = await ticketForEventStartingIn(-12); // ended 9 hours ago

    const late = await scan(seller.user, code);
    expect(late.status).toBe(409);
    expect(late.body.message).toMatch(/ended/);
  });
});

describe("VVIP tickets", () => {
  it("can be created and are shown with their tier", async () => {
    const seller = await createSeller();
    const created = await api()
      .post("/api/v1/events")
      .set(authHeader(seller.user))
      .send({
        title: "VVIP Night",
        description: "An event with a top tier ticket.",
        venue: "KICC",
        city: "Nairobi",
        country: "Kenya",
        startsAt: inDays(7).toISOString(),
        endsAt: inDays(7, 3).toISOString(),
      });
    const eventId = created.body.data.id as string;

    const res = await api()
      .post(`/api/v1/events/${eventId}/tickets`)
      .set(authHeader(seller.user))
      .send({ name: "Backstage", tier: "VVIP", priceCents: 500_000, quantity: 10 });

    expect(res.status).toBe(201);
    expect(res.body.data.tier).toBe("VVIP");
  });
});

describe("tickets while an event is in review", () => {
  it("can't change until the event is withdrawn", async () => {
    const seller = await createSeller();
    const { event } = await createEventWithTicket({ sellerProfileId: seller.profile.id, eventStatus: "DRAFT" });
    const addTicket = () =>
      api()
        .post(`/api/v1/events/${event.id}/tickets`)
        .set(authHeader(seller.user))
        .send({ name: "Extra", tier: "REGULAR", priceCents: 100_000, quantity: 5 });

    expect((await api().post(`/api/v1/events/${event.id}/submit`).set(authHeader(seller.user))).status).toBe(200);

    const blocked = await addTicket();
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toMatch(/waiting for review/);

    await api().post(`/api/v1/events/${event.id}/withdraw`).set(authHeader(seller.user));
    expect((await addTicket()).status).toBe(201);
  });
});
// ==========================================
// END OF FILE: backend/tests/entry-rules.test.ts
// ==========================================