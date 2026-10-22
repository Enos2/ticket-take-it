// ==========================================
// FILE: backend/src/utils/email.ts
// PURPOSE: Sends email through Resend. Prints to the terminal when no API key is set.
// ==========================================
import { env } from "../config/env";
import { logger } from "./logger";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Returns true if the provider accepted the email. Never throws.
export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    if (env.NODE_ENV === "production") {
      logger.error(`Email to ${msg.to} not sent: RESEND_API_KEY is missing`);
    } else {
      logger.info(
        `\n--- EMAIL (not sent, no RESEND_API_KEY) ---\nTo: ${msg.to}\nSubject: ${msg.subject}\n\n${msg.text}\n--- END EMAIL ---`
      );
    }
    return false;
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [msg.to],
          subject: msg.subject,
          html: msg.html,
          text: msg.text,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) return true;

      const body = await res.text().catch(() => "");
      const retryable = res.status === 429 || res.status >= 500;
      logger.error(`Resend rejected email to ${msg.to} (${res.status}): ${body.slice(0, 300)}`);
      if (!retryable) return false;
    } catch (err) {
      logger.error({ err }, `Email to ${msg.to} failed (attempt ${attempt})`);
    }

    if (attempt < 2) await sleep(1_000);
  }

  return false;
}
// ==========================================
// END OF FILE: backend/src/utils/email.ts
// ==========================================