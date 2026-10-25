// ==========================================
// FILE: frontend/src/components/EmailBanner.tsx
// PURPOSE: Reminds signed-in people to verify their email, and lets them resend the link.
// ==========================================
import { useState } from "react";
import { MailWarning } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/authStore";

type SendState = "idle" | "sending" | "sent" | "error";

export default function EmailBanner() {
  const user = useAuth((s) => s.user);
  const [state, setState] = useState<SendState>("idle");
  const [message, setMessage] = useState("");

  if (!user || user.emailVerified) return null;

  async function resend() {
    setState("sending");
    try {
      await api.post("/auth/resend-verification");
      setState("sent");
    } catch (err) {
      setMessage(errorMessage(err));
      setState("error");
    }
  }

  return (
    <div className="border-b border-gold/30 bg-gold/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm sm:px-6">
        <MailWarning className="size-4 shrink-0 text-gold" aria-hidden="true" />
        <p className="flex-1 text-fg">
          {state === "sent"
            ? `We sent a new link to ${user.email}. Check your inbox.`
            : state === "error"
              ? message
              : `Please verify your email address. We sent a link to ${user.email}.`}
        </p>
        {state !== "sent" ? (
          <button
            type="button"
            onClick={() => void resend()}
            disabled={state === "sending"}
            className="font-semibold text-gold underline-offset-4 hover:underline disabled:opacity-60"
          >
            {state === "sending" ? "Sending..." : "Resend link"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/EmailBanner.tsx
// ==========================================