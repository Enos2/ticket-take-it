// ==========================================
// FILE: backend/src/utils/engagementTemplates.ts
// PURPOSE: Emails for event reminders and for new events from organisers a person follows.
// ==========================================
import { appLink, button, esc, layout, para, small } from "./emailTemplates";
import type { RenderedEmail } from "./emailTemplates";

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

// Events have no time zone yet, so times are shown in Nairobi time.
const when = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Nairobi",
  }).format(date);

export function eventReminderEmail(input: {
  name: string;
  eventTitle: string;
  startsAt: Date;
  venue: string;
  city: string;
  ticketCount: number;
}): RenderedEmail {
  const title = oneLine(input.eventTitle);
  const tickets = `${input.ticketCount} ${input.ticketCount === 1 ? "ticket" : "tickets"}`;
  const where = `${oneLine(input.venue)}, ${oneLine(input.city)}`;
  const url = appLink("/account/tickets");

  return {
    subject: `Reminder: ${title} is coming up`,
    html: layout(
      "Your event is coming up",
      para(`Hi ${esc(input.name)}, <strong>${esc(title)}</strong> starts on ${esc(when(input.startsAt))}.`) +
        para(`${esc(where)}<br/>You have ${esc(tickets)}.`) +
        button(url, "Open my tickets") +
        small("Have your QR code ready on your phone. Each code works once. You can turn these reminders off in Settings.")
    ),
    text: `Hi ${input.name},\n\n${title} starts on ${when(input.startsAt)}.\n${where}\nYou have ${tickets}.\n\nOpen your tickets: ${url}\n\nYou can turn these reminders off in Settings.`,
  };
}

export function newEventEmail(input: {
  name: string;
  organizer: string;
  eventTitle: string;
  slug: string;
  startsAt: Date;
  venue: string;
  city: string;
}): RenderedEmail {
  const title = oneLine(input.eventTitle);
  const organizer = oneLine(input.organizer);
  const where = `${oneLine(input.venue)}, ${oneLine(input.city)}`;
  const url = appLink(`/events/${input.slug}`);

  return {
    subject: `${organizer} just announced ${title}`,
    html: layout(
      "A new event from an organiser you follow",
      para(`Hi ${esc(input.name)}, ${esc(organizer)} has put <strong>${esc(title)}</strong> on sale.`) +
        para(`${esc(when(input.startsAt))}<br/>${esc(where)}`) +
        button(url, "See the event") +
        small(`You get this because you follow ${esc(organizer)}. Unfollow them on their page, or turn these emails off in Settings.`)
    ),
    text: `Hi ${input.name},\n\n${organizer} has put ${title} on sale.\n${when(input.startsAt)}\n${where}\n\nSee the event: ${url}\n\nYou get this because you follow ${organizer}. Unfollow them on their page, or turn these emails off in Settings.`,
  };
}
// ==========================================
// END OF FILE: backend/src/utils/engagementTemplates.ts
// ==========================================