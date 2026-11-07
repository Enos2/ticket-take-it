// ==========================================
// FILE: backend/src/utils/email.ts
// PURPOSE: Sends email through Resend. A failed email is kept in a queue and retried. Without an API key it prints to the terminal.
// ==========================================
import { prisma } from "../config/database";
import { env } from "../config/env";
import { logger } from "./logger";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendOptions {
  // Emails that carry a secret link (password reset, email verification) are never stored.
  // If one fails, the person just asks for a new link.
  persist?: boolean;
}

export interface DeliveryResult {
  ok: boolean;
  retryable: boolean;
  error: string | null;
}

// How long to wait before each retry: 1 minute, 5 minutes, 30 minutes, 2 hours, 6 hours.
export const RETRY_DELAYS_MS = [1, 5, 30, 120, 360].map((minutes) => minutes * 60_000);
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

// While one attempt is running, nobody else may pick the same email up.
export const LEASE_MS = 10 * 60_000;

// One attempt to hand the email to Resend. Never throws.
export async function deliver(msg: EmailMessage): Promise<DeliveryResult> {
  if (!env.RESEND_API_KEY) return { ok: false, retryable: false, error: "RESEND_API_KEY is not set" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true, retryable: false, error: null };

    const body = (await res.text().catch(() => "")).slice(0, 300);
    // 429 and 5xx are temporary. Anything else (a bad address, a rejected sender) won't change by waiting.
    const retryable = res.status === 429 || res.status >= 500;
    return { ok: false, retryable, error: `Resend ${res.status}: ${body}` };
  } catch (err) {
    return { ok: false, retryable: true, error: err instanceof Error ? err.message : "Network error" };
  }
}

// Records what happened to one queued email: sent, scheduled for a retry, or given up on.
export async function settleAttempt(id: string, attemptsBefore: number, result: DeliveryResult): Promise<void> {
  const attempts = attemptsBefore + 1;

  if (result.ok) {
    // The text is wiped once an email is sent, so the queue doesn't keep old messages.
    await prisma.emailOutbox.update({
      where: { id },
      data: { status: "SENT", attempts, sentAt: new Date(), lastError: null, html: "", text: "" },
    });
    return;
  }

  const giveUp = !result.retryable || attempts >= MAX_ATTEMPTS;
  await prisma.emailOutbox.update({
    where: { id },
    data: giveUp
      ? { status: "FAILED", attempts, lastError: result.error }
      : { attempts, lastError: result.error, nextAttemptAt: new Date(Date.now() + RETRY_DELAYS_MS[attempts - 1]) },
  });
}

// Returns true if the email was accepted right away. False means it failed, and may be retried later.
export async function sendEmail(msg: EmailMessage, options: SendOptions = {}): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    if (env.NODE_ENV === "production") {
      logger.error(`Email to ${msg.to} not sent: RESEND_API_KEY is missing`);
    } else {
      logger.info(`\n--- EMAIL (not sent, no RESEND_API_KEY) ---\nTo: ${msg.to}\nSubject: ${msg.subject}\n\n${msg.text}\n--- END EMAIL ---`);
    }
    return false;
  }

  let rowId: string | null = null;
  if (options.persist ?? true) {
    try {
      const row = await prisma.emailOutbox.create({
        data: {
          toEmail: msg.to,
          subject: msg.subject,
          html: msg.html,
          text: msg.text,
          nextAttemptAt: new Date(Date.now() + LEASE_MS), // held back while this first attempt runs
        },
      });
      rowId = row.id;
    } catch (err) {
      logger.error({ err }, "Could not save the email to the queue. Sending without a retry.");
    }
  }

  const result = await deliver(msg);

  if (rowId) {
    try {
      await settleAttempt(rowId, 0, result);
    } catch (err) {
      logger.error({ err }, "Could not update the email queue");
    }
  }

  if (!result.ok) {
    logger.error(`Email to ${msg.to} failed: ${result.error}${rowId && result.retryable ? " (will retry)" : ""}`);
  }
  return result.ok;
}
// ==========================================
// END OF FILE: backend/src/utils/email.ts
// ==========================================