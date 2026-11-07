// ==========================================
// FILE: backend/src/utils/monitoring.ts
// PURPOSE: Reports server crashes to Sentry. Does nothing unless SENTRY_DSN is set.
// ==========================================
import * as Sentry from "@sentry/node";
import { env } from "../config/env";

let enabled = false;

export function initMonitoring(): void {
  if (!env.SENTRY_DSN || enabled) return;
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, sendDefaultPii: false });
  enabled = true;
}

export function captureError(err: unknown, tags?: Record<string, string>): void {
  if (!enabled) return;
  Sentry.captureException(err, tags ? { tags } : undefined);
}

// Gives Sentry a moment to send what it has before the process exits.
export async function flushMonitoring(): Promise<void> {
  if (enabled) await Sentry.flush(2_000);
}
// ==========================================
// END OF FILE: backend/src/utils/monitoring.ts
// ==========================================