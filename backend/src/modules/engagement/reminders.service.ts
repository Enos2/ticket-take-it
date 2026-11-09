// ==========================================
// FILE: backend/src/modules/engagement/reminders.service.ts
// PURPOSE: Event reminders, and the "new event from an organiser you follow" email. Each goes out at most once.
// ==========================================
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { eventReminderEmail, newEventEmail } from "../../utils/engagementTemplates";
import { sendEmail } from "../../utils/email";

const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_REMINDERS_PER_RUN = 100;
const MAX_FOLLOWER_EMAILS = 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// Stays under the email provider's rate limit. Tests don't wait.
const pause = () => (env.NODE_ENV === "test" ? Promise.resolve() : sleep(600));

const isUnique = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

// Runs every 5 minutes. When an event is less than a day away, everyone who bought tickets before that
// moment gets one reminder. Tickets bought inside the last day don't need one.
export async function sendEventReminders(): Promise<number> {
  const now = new Date();

  const events = await prisma.event.findMany({
    where: {
      status: { in: ["PUBLISHED", "SOLD_OUT"] },
      startsAt: { gt: now, lte: new Date(now.getTime() + REMINDER_WINDOW_MS) },
    },
    select: { id: true, title: true, startsAt: true, venue: true, city: true },
    orderBy: { startsAt: "asc" },
    take: 20,
  });

  let sent = 0;

  for (const event of events) {
    if (sent >= MAX_REMINDERS_PER_RUN) break;

    const cutoff = new Date(event.startsAt.getTime() - REMINDER_WINDOW_MS);
    const tickets = await prisma.ticket.findMany({
      where: { eventId: event.id, status: "VALID", createdAt: { lte: cutoff }, user: { isActive: true, notifyReminders: true } },
      select: { userId: true, user: { select: { email: true, fullName: true } } },
    });

    const holders = new Map<string, { email: string; name: string; count: number }>();
    for (const t of tickets) {
      const existing = holders.get(t.userId);
      if (existing) existing.count += 1;
      else holders.set(t.userId, { email: t.user.email, name: t.user.fullName, count: 1 });
    }
    if (holders.size === 0) continue;

    const done = new Set(
      (await prisma.eventReminder.findMany({ where: { eventId: event.id, userId: { in: [...holders.keys()] } }, select: { userId: true } })).map(
        (r) => r.userId
      )
    );

    for (const [userId, holder] of holders) {
      if (done.has(userId)) continue;
      if (sent >= MAX_REMINDERS_PER_RUN) break;

      // Claim first: if two servers run at once, only one gets to send.
      try {
        await prisma.eventReminder.create({ data: { eventId: event.id, userId } });
      } catch (err) {
        if (isUnique(err)) continue;
        throw err;
      }

      await sendEmail({
        to: holder.email,
        ...eventReminderEmail({
          name: holder.name,
          eventTitle: event.title,
          startsAt: event.startsAt,
          venue: event.venue,
          city: event.city,
          ticketCount: holder.count,
        }),
      });
      sent++;
      await pause();
    }
  }

  return sent;
}

// Tells an organiser's followers that an event is on sale. Safe to call as many times as you like:
// the first call claims the event, so nobody is emailed twice, even if it is unpublished and approved again.
export async function notifyFollowersOfNewEvent(eventId: string): Promise<number> {
  const claimed = await prisma.event.updateMany({
    where: { id: eventId, status: "PUBLISHED", announcedAt: null },
    data: { announcedAt: new Date() },
  });
  if (claimed.count === 0) return 0;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { title: true, slug: true, startsAt: true, venue: true, city: true, seller: { select: { id: true, businessName: true } } },
  });
  if (!event) return 0;

  const followers = await prisma.follow.findMany({
    where: { sellerId: event.seller.id, user: { isActive: true, notifyNewEvents: true } },
    select: { user: { select: { email: true, fullName: true } } },
    take: MAX_FOLLOWER_EMAILS,
  });

  let sent = 0;
  for (const follower of followers) {
    await sendEmail({
      to: follower.user.email,
      ...newEventEmail({
        name: follower.user.fullName,
        organizer: event.seller.businessName,
        eventTitle: event.title,
        slug: event.slug,
        startsAt: event.startsAt,
        venue: event.venue,
        city: event.city,
      }),
    });
    sent++;
    await pause();
  }

  return sent;
}
// ==========================================
// END OF FILE: backend/src/modules/engagement/reminders.service.ts
// ==========================================