// ==========================================
// FILE: backend/tests/moderation.test.ts
// PURPOSE: Event review: submit, approve, reject, take down, restore.
// ==========================================
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/config/database";
import { api, authHeader, createEventWithTicket, createSeller, createUser, inDays, placeOrder, resetDb } from "./helpers";

beforeEach(resetDb);

type Actor = { id: string; email: string; role: "USER" | "SELLER" | "ADMIN" };

const eventBody = () => ({
  title: "Review Night",
  description: "An event used to test the review flow.",
  venue: "KICC",
  city: "Nairobi",
  country: "Kenya",
  startsAt: inDays(7).toISOString(),
  endsAt: inDays(7, 3).toISOString(),
});

async function draft() {
  const seller = await createSeller();
  const { event, ticket } = await createEventWithTicket({ sellerProfileId: seller.profile.id, eventStatus: "DRAFT" });
  return { seller, event, ticket };
}

const submit = (user: Actor, eventId: string) => api().post(`/api/v1/events/${eventId}/submit`).set(authHeader(user));
const decide = (user: Actor, eventId: string, action: string, body: object = {}) =>
  api().post(`/api/v1/admin/events/${eventId}/${action}`).set(authHeader(user)).send(body);
const publicPage = (slug: string) => api().get(`/api/v1/events/${slug}`);
const statusOf = async (eventId: string) => (await prisma.event.findUniqueOrThrow({ where: { id: eventId } })).status;

describe("submitting for review", () => {
  it("moves a ready draft into review, hidden from the public and from buyers", async () => {
    const { seller, event, ticket } = await draft();

    const res = await submit(seller.user, event.id);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("PENDING_REVIEW");

    expect((await publicPage(event.slug)).status).toBe(404);
    const buyer = await createUser("USER");
    expect((await placeOrder(buyer, [{ ticketTypeId: ticket.id, quantity: 1 }])).status).toBe(400);
  });

  it("refuses an event that isn't ready", async () => {
    const seller = await createSeller();
    const created = await api().post("/api/v1/events").set(authHeader(seller.user)).send(eventBody());
    const eventId = created.body.data.id as string;

    const noTickets = await submit(seller.user, eventId);
    expect(noTickets.status).toBe(400);
    expect(noTickets.body.message).toMatch(/Fix these/);
    expect(await statusOf(eventId)).toBe("DRAFT");

    const { event } = await createEventWithTicket({ sellerProfileId: seller.profile.id, eventStatus: "DRAFT" });
    await prisma.event.update({ where: { id: event.id }, data: { startsAt: inDays(-1) } });
    const started = await submit(seller.user, event.id);
    expect(started.status).toBe(400);
    expect(started.body.message).toMatch(/start time has passed/);
  });

  it("can't be edited while it waits, but can be withdrawn and edited", async () => {
    const { seller, event } = await draft();
    await submit(seller.user, event.id);

    const edit = (title: string) => api().patch(`/api/v1/events/${event.id}`).set(authHeader(seller.user)).send({ title });

    expect((await edit("Changed after submitting")).status).toBe(400);

    const withdrawn = await api().post(`/api/v1/events/${event.id}/withdraw`).set(authHeader(seller.user));
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body.data.status).toBe("DRAFT");
    expect((await edit("Changed after withdrawing")).status).toBe(200);
  });

  it("lets an admin's own events go live straight away", async () => {
    const admin = await createUser("ADMIN");
    const seller = await createSeller();
    const { event } = await createEventWithTicket({ sellerProfileId: seller.profile.id, eventStatus: "DRAFT" });

    const res = await submit(admin, event.id);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("PUBLISHED");
    expect((await publicPage(event.slug)).status).toBe(200);
  });

  it("treats the older publish call from a seller as a submission", async () => {
    const { seller, event } = await draft();
    const res = await api().post(`/api/v1/events/${event.id}/publish`).set(authHeader(seller.user));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("PENDING_REVIEW");
  });
});

describe("review decisions", () => {
  it("approves an event: it goes public and buyers can buy", async () => {
    const { seller, event, ticket } = await draft();
    const admin = await createUser("ADMIN");
    await submit(seller.user, event.id);

    const res = await decide(admin, event.id, "approve");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("PUBLISHED");
    expect(res.body.data.reviewedById).toBe(admin.id);

    expect((await publicPage(event.slug)).status).toBe(200);
    const buyer = await createUser("USER");
    expect((await placeOrder(buyer, [{ ticketTypeId: ticket.id, quantity: 1 }])).status).toBe(201);
  });

  it("is only for admins", async () => {
    const { seller, event } = await draft();
    const buyer = await createUser("USER");
    await submit(seller.user, event.id);

    expect((await decide(seller.user, event.id, "approve")).status).toBe(403);
    expect((await decide(buyer, event.id, "approve")).status).toBe(403);
    expect((await decide(seller.user, event.id, "reject", { reason: "Trying my luck" })).status).toBe(403);
    expect(await statusOf(event.id)).toBe("PENDING_REVIEW");
  });

  it("can't approve something that isn't waiting, or for a seller who is no longer approved", async () => {
    const { seller, event } = await draft();
    const admin = await createUser("ADMIN");

    expect((await decide(admin, event.id, "approve")).status).toBe(400); // still a draft

    await submit(seller.user, event.id);
    await prisma.sellerProfile.update({ where: { id: seller.profile.id }, data: { status: "SUSPENDED" } });
    const res = await decide(admin, event.id, "approve");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not approved/);
  });

  it("needs a reason to reject, shows it to the seller, and lets them fix and resubmit", async () => {
    const { seller, event } = await draft();
    const admin = await createUser("ADMIN");
    await submit(seller.user, event.id);

    expect((await decide(admin, event.id, "reject")).status).toBe(400);
    expect((await decide(admin, event.id, "reject", { reason: "no" })).status).toBe(400);

    const rejected = await decide(admin, event.id, "reject", { reason: "The description is missing the venue address" });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.status).toBe("REJECTED");

    const own = await api().get(`/api/v1/sellers/events/${event.id}`).set(authHeader(seller.user));
    expect(own.body.data.reviewNote).toBe("The description is missing the venue address");

    const fix = await api().patch(`/api/v1/events/${event.id}`).set(authHeader(seller.user)).send({ title: "Fixed title" });
    expect(fix.status).toBe(200);

    const again = await submit(seller.user, event.id);
    expect(again.body.data.status).toBe("PENDING_REVIEW");
    expect(again.body.data.reviewNote).toBeNull();
  });
});

describe("taking an event down", () => {
  it("stops sales and hides the event, but leaves tickets already sold working", async () => {
    const seller = await createSeller();
    const admin = await createUser("ADMIN");
    const { event, ticket } = await createEventWithTicket({ sellerProfileId: seller.profile.id, priceCents: 0 });

    const holder = await createUser("USER");
    const bought = await placeOrder(holder, [{ ticketTypeId: ticket.id, quantity: 1 }]);
    expect(bought.status).toBe(201);
    const orderId = bought.body.data.id as string;
    const code = bought.body.data.tickets[0].code as string;

    const down = await decide(admin, event.id, "takedown", { reason: "Reported as misleading" });
    expect(down.status).toBe(200);
    expect(down.body.data.status).toBe("TAKEN_DOWN");

    expect((await publicPage(event.slug)).status).toBe(404);
    const newcomer = await createUser("USER");
    expect((await placeOrder(newcomer, [{ ticketTypeId: ticket.id, quantity: 1 }])).status).toBe(400);

    // What was already sold is untouched.
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PAID");
    expect((await prisma.ticket.findFirstOrThrow({ where: { orderId } })).status).toBe("VALID");
    const scan = await api().post("/api/v1/checkin").set(authHeader(seller.user)).send({ code });
    expect(scan.status).toBe(200);

    // Restoring puts everything back.
    const restored = await decide(admin, event.id, "restore");
    expect(restored.body.data.status).toBe("PUBLISHED");
    expect((await publicPage(event.slug)).status).toBe(200);
    expect((await placeOrder(newcomer, [{ ticketTypeId: ticket.id, quantity: 1 }])).status).toBe(201);
  });

  it("needs a reason, and only works on a live event", async () => {
    const seller = await createSeller();
    const admin = await createUser("ADMIN");
    const live = await createEventWithTicket({ sellerProfileId: seller.profile.id });
    const draftEvent = await createEventWithTicket({ sellerProfileId: seller.profile.id, eventStatus: "DRAFT" });

    expect((await decide(admin, live.event.id, "takedown")).status).toBe(400);
    expect((await decide(admin, draftEvent.event.id, "takedown", { reason: "Not even live" })).status).toBe(400);
    expect(await statusOf(live.event.id)).toBe("PUBLISHED");
  });

  it("can still be cancelled afterwards, which voids the tickets", async () => {
    const seller = await createSeller();
    const admin = await createUser("ADMIN");
    const { event, ticket } = await createEventWithTicket({ sellerProfileId: seller.profile.id, priceCents: 0 });

    const holder = await createUser("USER");
    const bought = await placeOrder(holder, [{ ticketTypeId: ticket.id, quantity: 1 }]);
    const orderId = bought.body.data.id as string;

    await decide(admin, event.id, "takedown", { reason: "Under investigation" });

    const cancelled = await api().post(`/api/v1/events/${event.id}/cancel`).set(authHeader(seller.user));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.event.status).toBe("CANCELLED");
    expect(await prisma.ticket.count({ where: { orderId, status: "VOID" } })).toBe(1);
  });
});

describe("the admin overview", () => {
  it("counts events waiting for review", async () => {
    const admin = await createUser("ADMIN");
    const { seller, event } = await draft();

    const before = await api().get("/api/v1/admin/stats").set(authHeader(admin));
    expect(before.body.data.pendingEvents).toBe(0);

    await submit(seller.user, event.id);
    const after = await api().get("/api/v1/admin/stats").set(authHeader(admin));
    expect(after.body.data.pendingEvents).toBe(1);

    const queue = await api().get("/api/v1/admin/events?status=PENDING_REVIEW").set(authHeader(admin));
    expect(queue.body.data).toHaveLength(1);
  });
});
// ==========================================
// END OF FILE: backend/tests/moderation.test.ts
// ==========================================