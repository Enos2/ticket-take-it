// ==========================================
// FILE: backend/src/utils/reviewTemplates.ts
// PURPOSE: Emails that tell a seller what happened to their event in review.
// ==========================================
import { appLink, button, esc, layout, para, small } from "./emailTemplates";
import type { RenderedEmail } from "./emailTemplates";

export type ReviewOutcome = "APPROVED" | "REJECTED" | "TAKEN_DOWN" | "RESTORED";

interface Copy {
  subject: string;
  heading: string;
  body: string;
  cta: string;
  note?: string;
}

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

export function eventReviewEmail(input: {
  name: string;
  eventTitle: string;
  eventId: string;
  outcome: ReviewOutcome;
  reason?: string | null;
}): RenderedEmail {
  const title = oneLine(input.eventTitle);
  const reason = input.reason ? oneLine(input.reason) : null;
  const url = appLink(`/seller/events/${input.eventId}`);

  const copy: Record<ReviewOutcome, Copy> = {
    APPROVED: {
      subject: `Your event "${title}" is approved`,
      heading: "Your event is live",
      body: `${title} passed review and is now on sale. People can find it and buy tickets.`,
      cta: "Open your event",
    },
    REJECTED: {
      subject: `Your event "${title}" needs changes`,
      heading: "Changes needed",
      body: `${title} was not approved yet. Fix the problem below, then submit it again.`,
      cta: "Edit your event",
    },
    TAKEN_DOWN: {
      subject: `Your event "${title}" has been taken down`,
      heading: "Event taken down",
      body: `${title} was taken down by the Ticket Take It team. Ticket sales are paused and it is hidden from the public site.`,
      cta: "View your event",
      note: "Tickets that were already sold stay valid, and the door scanner keeps working. Contact us if you think this is a mistake.",
    },
    RESTORED: {
      subject: `Your event "${title}" is live again`,
      heading: "Your event is live again",
      body: `${title} was restored. It is back on the public site and ticket sales have resumed.`,
      cta: "Open your event",
    },
  };

  const c = copy[input.outcome];

  return {
    subject: c.subject,
    html: layout(
      c.heading,
      para(`Hi ${esc(input.name)}, ${esc(c.body)}`) +
        (reason ? para(`<strong>Reason:</strong> ${esc(reason)}`) : "") +
        button(url, c.cta) +
        (c.note ? small(esc(c.note)) : "")
    ),
    text: `Hi ${input.name},\n\n${c.body}${reason ? `\n\nReason: ${reason}` : ""}\n\n${c.cta}: ${url}${c.note ? `\n\n${c.note}` : ""}`,
  };
}
// ==========================================
// END OF FILE: backend/src/utils/reviewTemplates.ts
// ==========================================