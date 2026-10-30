// ==========================================
// FILE: backend/src/modules/notifications/reviewNotifications.service.ts
// PURPOSE: Emails the seller when an admin approves, rejects, takes down or restores their event.
// ==========================================
import { prisma } from "../../config/database";
import { sendEmail } from "../../utils/email";
import { eventReviewEmail } from "../../utils/reviewTemplates";
import type { ReviewOutcome } from "../../utils/reviewTemplates";

// Safe to call from a background task: it never throws into the request.
export async function notifyEventReview(eventId: string, outcome: ReviewOutcome) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      reviewNote: true,
      seller: { select: { user: { select: { email: true, fullName: true } } } },
    },
  });
  if (!event) return;

  await sendEmail({
    to: event.seller.user.email,
    ...eventReviewEmail({
      name: event.seller.user.fullName,
      eventTitle: event.title,
      eventId: event.id,
      outcome,
      reason: outcome === "REJECTED" || outcome === "TAKEN_DOWN" ? event.reviewNote : null,
    }),
  });
}
// ==========================================
// END OF FILE: backend/src/modules/notifications/reviewNotifications.service.ts
// ==========================================