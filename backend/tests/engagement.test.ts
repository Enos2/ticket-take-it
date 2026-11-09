// ==========================================
// FILE: backend/tests/engagement.test.ts
// PURPOSE: Saved events, following, organiser pages, related and trending events, preferences, and the two emails.
// ==========================================
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/config/database";
import { env } from "../src/config/env";
import { notifyFollowersOfNewEvent, sendEventReminders } from "../src/modules/engagement/reminders.service";
import { api, authHeader, createEventWithTicket, createSeller, createUser, placeOrder, resetDb } from "./helpers";

beforeEach(resetDb);

afterEach(() => {
  env.RESEND_API_KEY = undefined;
  vi.unstubAllGlobals();
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Emails are only stored in the queue when email is switched on, so tests that look at them switch it on late,
// after the order emails from setup have already been handled.
function enableEmail() {
  env.RESEND_API_KEY = "re_test_key";
  vi.stubGlobal("fetch", vi.fn(async () => new Response('{"id":"x"}', { status: 200 })));
}

const subjects = async (word: string) =>
  (await prisma.emailOutbox.findMany({ select: { subject: true } })).map((r) => r.subject).filter((s) => s.includes(word));

describe("saved events", () => {
  it("saves, lists and removes, and saving twice changes nothing", async () => {
    const seller = await createSeller();
    const { event } = await createEventWithTicket({ sellerProfileId: seller.profile.id });
    const user = await createUser("USER");
    const save = () => api().post(`/api/v1/engagement/favorites/${event.id}`).set(authHeader(user));

    expect((await save()).status).toBe(201);
    expect((await save()).status).toBe(201);
    expect(await prisma.favorite.count({ where: { userId: user.id } })).toBe(1);

    const ids = await api().get("/api/v1/engagement/favorites/ids").set(authHeader(user));
    expect(ids.body.data).toEqual([event.id]);

    const list = await api().get("/api/v1/engagement/favorites").set(authHeader(user));
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].id).toBe(event.id);
    expect(list.body.data[0].ticketTypes).toHaveLength(1);

    expect((await api().delete(`/api/v1/engagement/favorites/${event.id}`).set(authHeader(user))).status).toBe(200);
    expect((await api().get("/api/v1/engagement/favorites/ids").set(authHeader(user))).body.data).toEqual([]);
  });

  it("is private to each person, needs a login, and only works for live events", async () => {
    const seller = await createSeller();
    const live = await createEventWithTicket({ sellerProfileId: seller.profile.id });
    const draft = await createEventWithTicket({ sellerProfileId: seller.profile.id, eventStatus: "DRAFT" });
    const alice = await createUser("USER");
    const bob = await createUser("USER");

    await api().post(`/api/v1/engagement/favorites/${live.event.id}`).set(authHeader(alice));
    expect((await api().get("/api/v1/engagement/favorites/ids").set(authHeader(bob))).body.data).toEqual([]);

    expect((await api().post(`/api/v1/engagement/favorites/${draft.event.id}`).set(authHeader(alice))).status).toBe(404);
    expect((await api().post("/api/v1/engagement/favorites/nope").set(authHeader(alice))).status).toBe(404);
    expect((await api().get("/api/v1/engagement/favorites/ids")).status).toBe(401);
  });

  it("stops listing an event once it is taken down", async () => {
    const seller = await createSeller();
    const { event } = await createEventWithTicket({ sellerProfileId: seller.profile.id });
    const user = await createUser("USER");
    await api().post(`/api/v1/engagement/favorites/${event.id}`).set(authHeader(user));

    await prisma.event.update({ where: { id: event.id }, data: { status: "TAKEN_DOWN" } });

    expect((await api().get("/api/v1/engagement/favorites").set(authHeader(user))).body.data).toHaveLength(0);
  });
});

describe("following organisers", () => {
  it("follows and unfollows, and refuses your own account and unapproved sellers", async () => {
    const organiser = await createSeller("APPROVED");
    const pending = await createSeller("PENDING");
    const fan = await createUser("USER");
    const follow = (id: string, user = fan) => api().post(`/api/v1/engagement/follows/${id}`).set(authHeader(user));

    expect((await follow(organiser.profile.id)).status).toBe(201);
    expect((await follow(organiser.profile.id)).status).toBe(201); // twice is fine
    expect(await prisma.follow.count({ where: { userId: fan.id } })).toBe(1);

    const ids = await api().get("/api/v1/engagement/follows/ids").set(authHeader(fan));
    expect(ids.body.data).toEqual([organiser.profile.id]);

    const list = await api().get("/api/v1/engagement/follows").set(authHeader(fan));
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ id: organiser.profile.id, followers: 1, upcomingEvents: 0 });

    expect((await follow(organiser.profile.id, organiser.user)).status).toBe(400); // your own organiser account
    expect((await follow(pending.profile.id)).status).toBe(404);

    expect((await api().delete(`/api/v1/engagement/follows/${organiser.profile.id}`).set(authHeader(fan))).status).toBe(200);
    expect(await prisma.follow.count()).toBe(0);
  });
});

describe("the public organiser page", () => {
  it("shows the counts to anyone, and never contact or payout details", async () => {
    const organiser = await createSeller("APPROVED");
    await prisma.sellerProfile.update({ where: { id: organiser.profile.id }, data: { payoutDetails: "254712345678" } });
    await createEventWithTicket({ sellerProfileId: organiser.profile.id }); // upcoming
    const fan = await createUser("USER");
    await api().post(`/api/v1/engagement/follows/${organiser.profile.id}`).set(authHeader(fan));

    const res = await api().get(`/api/v1/organizers/${organiser.profile.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: organiser.profile.id, followers: 1, upcomingEvents: 1, hostedEvents: 0 });
    expect(JSON.stringify(res.body)).not.toContain("254712345678");
    expect(JSON.stringify(res.body)).not.toContain(organiser.user.email);
  });

  it("is hidden for sellers who aren't approved, and for ids that don't exist", async () => {
    const pending = await createSeller("PENDING");
    expect((await api().get(`/api/v1/organizers/${pending.profile.id}`)).status).toBe(404);
    expect((await api().get("/api/v1/organizers/does-not-exist")).status).toBe(404);
  });

  it("lets the events list be limited to one organiser, and shows the organiser on the event page", async () => {
    const a = await createSeller();
    const b = await createSeller();
    const first = await createEventWithTicket({ sellerProfileId: a.profile.id });
    await createEventWithTicket({ sellerProfileId: b.profile.id });

    const list = await api().get(`/api/v1/events?sellerId=${a.profile.id}`);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].id).toBe(first.event.id);

    const page = await api().get(`/api/v1/events/${first.event.slug}`);
    expect(page.status).toBe(200);
    expect(page.body.data.seller).toEqual({ id: a.profile.id, businessName: a.profile.businessName });
  });
});

describe("related, trending and recently viewed events", () => {
  it("suggests events in the same category and city, never the event itself or hidden ones", async () => {
    const seller = await createSeller();
    const base = await createEventWithTicket({ sellerProfileId: seller.profile.id });
    const twin = await createEventWithTicket({ sellerProfileId: seller.profile.id });
    const stranger = await createEventWithTicket({ sellerProfileId: seller.profile.id });
    const hidden = await createEventWithTicket({ sellerProfileId: seller.profile.id, eventStatus: "DRAFT" });

    await prisma.event.update({ where: { id: base.event.id }, data: { category: "MUSIC", city: "Nairobi" } });
    await prisma.event.update({ where: { id: twin.event.id }, data: { category: "MUSIC", city: "Mombasa" } });
    await prisma.event.update({ where: { id: stranger.event.id }, data: { category: "SPORTS", city: "Kisumu" } });
    await prisma.event.update({ where: { id: hidden.event.id }, data: { category: "MUSIC", city: "Nairobi" } });
    const other = await prisma.event.findUniqueOrThrow({ where: { id: stranger.event.id } });
    // A different organiser, so only category and city can connect it.
    const outsider = await createSeller();
    await prisma.event.update({ where: { id: other.id }, data: { sellerId: outsider.profile.id } });

    const res = await api().get(`/api/v1/events/${base.event.slug}/similar`);
    expect(res.status).toBe(200);

    const ids = res.body.data.map((e: { id: string }) => e.id);
    expect(ids).toContain(twin.event.id);
    expect(ids).not.toContain(base.event.id);
    expect(ids).not.toContain(hidden.event.id);
    expect(ids).not.toContain(stranger.event.id);

    expect((await api().get("/api/v1/events/no-such-event/similar")).status).toBe(404);
  });

  it("ranks events by recent ticket sales, and leaves out events nobody bought into", async () => {
    const seller = await createSeller();
    const busy = await createEventWithTicket({ sellerProfileId: seller.profile.id, priceCents: 0, quantity: 20 });
    const quiet = await createEventWithTicket({ sellerProfileId: seller.profile.id, priceCents: 0, quantity: 20 });
    const stale = await createEventWithTicket({ sellerProfileId: seller.profile.id, priceCents: 0, quantity: 20 });
    await createEventWithTicket({ sellerProfileId: seller.profile.id, priceCents: 0 }); // no sales at all

    const buyer = await createUser("USER");
    expect((await placeOrder(buyer, [{ ticketTypeId: busy.ticket.id, quantity: 3 }])).status).toBe(201);
    expect((await placeOrder(buyer, [{ ticketTypeId: quiet.ticket.id, quantity: 1 }])).status).toBe(201);
    expect((await placeOrder(buyer, [{ ticketTypeId: stale.ticket.id, quantity: 5 }])).status).toBe(201);
    await prisma.ticket.updateMany({ where: { eventId: stale.event.id }, data: { createdAt: new Date(Date.now() - 20 * DAY) } });

    const res = await api().get("/api/v1/events/trending");
    expect(res.status).toBe(200);
    expect(res.body.data.map((e: { id: string }) => e.id)).toEqual([busy.event.id, quiet.event.id]);
  });

  it("looks events up by their links in the order asked, skipping hidden ones, and refuses bad input", async () => {
    const seller = await createSeller();
    const a = await createEventWithTicket({ sellerProfileId: seller.profile.id });
    const b = await createEventWithTicket({ sellerProfileId: seller.profile.id });
    const hidden = await createEventWithTicket({ sellerProfileId: seller.profile.id, eventStatus: "DRAFT" });

    const res = await api().get(`/api/v1/events/lookup?slugs=${b.event.slug},${hidden.event.slug},${a.event.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((e: { id: string }) => e.id)).toEqual([b.event.id, a.event.id]);

    expect((await api().get("/api/v1/events/lookup?slugs=Not A Slug")).status).toBe(400);
    expect((await api().get(`/api/v1/events/lookup?slugs=${Array.from({ length: 9 }, (_, i) => `s${i}`).join(",")}`)).status).toBe(400);
    expect((await api().get("/api/v1/events/lookup")).status).toBe(400);
  });
});

describe("email preferences", () => {
  it("start switched on, can be changed one at a time, and are private", async () => {
    const user = await createUser("USER");

    const before = await api().get("/api/v1/engagement/preferences").set(authHeader(user));
    expect(before.body.data).toEqual({ notifyReminders: true, notifyNewEvents: true });

    const changed = await api().patch("/api/v1/engagement/preferences").set(authHeader(user)).send({ notifyReminders: false });
    expect(changed.status).toBe(200);
    expect(changed.body.data).toEqual({ notifyReminders: false, notifyNewEvents: true });

    expect((await api().patch("/api/v1/engagement/preferences").set(authHeader(user)).send({})).status).toBe(400);
    expect((await api().get("/api/v1/engagement/preferences")).status).toBe(401);
  });
});

describe("event reminders", () => {
  // A person with free tickets, bought three days ago, for an event starting soon.
  async function holder(startsInHours: number, quantity = 2) {
    const seller = await createSeller();
    const { event, ticket } = await createEventWithTicket({ sellerProfileId: seller.profile.id, priceCents: 0, quantity: 20 });
    const buyer = await createUser("USER");
    expect((await placeOrder(buyer, [{ ticketTypeId: ticket.id, quantity }])).status).toBe(201);

    await prisma.event.update({
      where: { id: event.id },
      data: { startsAt: new Date(Date.now() + startsInHours * HOUR), endsAt: new Date(Date.now() + (startsInHours + 3) * HOUR) },
    });
    await prisma.ticket.updateMany({ where: { eventId: event.id }, data: { createdAt: new Date(Date.now() - 3 * DAY) } });
    return { event, buyer };
  }

  it("sends one reminder a day before, and never a second", async () => {
    const { event, buyer } = await holder(12);
    enableEmail();

    expect(await sendEventReminders()).toBe(1);
    expect(await prisma.eventReminder.count({ where: { eventId: event.id, userId: buyer.id } })).toBe(1);
    expect(await subjects("Reminder")).toHaveLength(1);

    expect(await sendEventReminders()).toBe(0);
    expect(await subjects("Reminder")).toHaveLength(1);
  });

  it("waits until the event is less than a day away, and skips events that already started", async () => {
    await holder(72);
    await holder(-2);
    enableEmail();

    expect(await sendEventReminders()).toBe(0);
  });

  it("skips people who switched reminders off, tickets that were cancelled, and tickets bought in the last day", async () => {
    const quiet = await holder(12);
    await prisma.user.update({ where: { id: quiet.buyer.id }, data: { notifyReminders: false } });

    const cancelled = await holder(12);
    await prisma.ticket.updateMany({ where: { eventId: cancelled.event.id }, data: { status: "VOID" } });

    const lateBuyer = await holder(12);
    await prisma.ticket.updateMany({ where: { eventId: lateBuyer.event.id }, data: { createdAt: new Date() } });

    enableEmail();
    expect(await sendEventReminders()).toBe(0);
  });

  it("sends one email per person, however many tickets they hold", async () => {
    const { buyer } = await holder(12, 4);
    enableEmail();

    expect(await sendEventReminders()).toBe(1);
    const rows = await prisma.emailOutbox.findMany({ where: { toEmail: buyer.email } });
    expect(rows.filter((r) => r.subject.includes("Reminder"))).toHaveLength(1);
  });
});

describe("telling followers about a new event", () => {
  it("emails followers once, and not people who turned it off", async () => {
    const organiser = await createSeller();
    const { event } = await createEventWithTicket({ sellerProfileId: organiser.profile.id });
    const fan = await createUser("USER");
    const quiet = await createUser("USER");
    const stranger = await createUser("USER");
    await prisma.follow.createMany({ data: [{ userId: fan.id, sellerId: organiser.profile.id }, { userId: quiet.id, sellerId: organiser.profile.id }] });
    await prisma.user.update({ where: { id: quiet.id }, data: { notifyNewEvents: false } });
    enableEmail();

    expect(await notifyFollowersOfNewEvent(event.id)).toBe(1);

    const mails = await prisma.emailOutbox.findMany({ where: { subject: { contains: "just announced" } } });
    expect(mails).toHaveLength(1);
    expect(mails[0].toEmail).toBe(fan.email);
    expect(mails.some((m) => m.toEmail === stranger.email)).toBe(false);

    // The same event can't be announced twice.
    expect(await notifyFollowersOfNewEvent(event.id)).toBe(0);
    expect(await prisma.emailOutbox.count({ where: { subject: { contains: "just announced" } } })).toBe(1);
  });

  it("says nothing about an event that isn't live", async () => {
    const organiser = await createSeller();
    const { event } = await createEventWithTicket({ sellerProfileId: organiser.profile.id, eventStatus: "DRAFT" });
    const fan = await createUser("USER");
    await prisma.follow.create({ data: { userId: fan.id, sellerId: organiser.profile.id } });
    enableEmail();

    expect(await notifyFollowersOfNewEvent(event.id)).toBe(0);
    expect(await prisma.emailOutbox.count({ where: { subject: { contains: "just announced" } } })).toBe(0);
  });
});
// ==========================================
// END OF FILE: backend/tests/engagement.test.ts
// ==========================================