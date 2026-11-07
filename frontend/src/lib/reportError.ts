// ==========================================
// FILE: frontend/src/lib/reportError.ts
// PURPOSE: Sends a short report to the server when the app crashes in someone's browser.
// ==========================================
const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") || "/api/v1";

type Kind = "render" | "error" | "promise";

// A crash that repeats must not flood the server.
const MAX_REPORTS = 5;
let sent = 0;

export function reportError(kind: Kind, error: unknown, extra?: string): void {
  if (sent >= MAX_REPORTS) return;
  sent += 1;

  const message = error instanceof Error ? error.message : String(error);
  const stack = [error instanceof Error ? error.stack : "", extra].filter(Boolean).join("\n");

  try {
    void fetch(`${BASE}/system/client-error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        message: message.slice(0, 500),
        stack: stack.slice(0, 4000),
        url: window.location.pathname, // the path only: addresses can carry secret tokens in their query
      }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* nothing more can be done */
  }
}

export function installErrorReporting(): void {
  window.addEventListener("error", (event) => reportError("error", event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => reportError("promise", event.reason));
}
// ==========================================
// END OF FILE: frontend/src/lib/reportError.ts
// ==========================================