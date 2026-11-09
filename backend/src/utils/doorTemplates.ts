// ==========================================
// FILE: backend/src/utils/doorTemplates.ts
// PURPOSE: The email a new door staff member receives.
// ==========================================
import { appLink, button, esc, layout, para, small } from "./emailTemplates";
import type { RenderedEmail } from "./emailTemplates";

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

export function staffInviteEmail(input: { businessName: string; hasAccount: boolean }): RenderedEmail {
  const org = oneLine(input.businessName);
  const url = appLink(input.hasAccount ? "/scan" : "/register");
  const action = input.hasAccount ? "Open the scanner" : "Create your account";
  const next = input.hasAccount
    ? "Sign in and open Scan tickets whenever you are at the door."
    : "Create an account with this email address and verify it. Then open Scan tickets whenever you are at the door.";
  const about = `${org} added you as door staff on Ticket Take It. You can scan tickets at their events and see who has arrived. You can't see their sales or money.`;

  return {
    subject: `You've been added to the door team for ${org}`,
    html: layout(
      "You're on the door team",
      para(esc(about)) + para(esc(next)) + button(url, action) + small("If you were not expecting this, you can ignore this email. Nothing happens unless you sign in.")
    ),
    text: `${about}\n\n${next}\n\n${action}: ${url}\n\nIf you were not expecting this, you can ignore this email.`,
  };
}
// ==========================================
// END OF FILE: backend/src/utils/doorTemplates.ts
// ==========================================