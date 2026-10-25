// ==========================================
// FILE: frontend/src/pages/public/ForgotPassword.tsx
// PURPOSE: Ask for a password reset link.
// ==========================================
import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { MailCheck } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import { Field } from "../../components/ui/Field";
import { api, errorMessage } from "../../lib/api";
import { useTitle } from "../../lib/useTitle";

export default function ForgotPassword() {
  useTitle("Reset password");

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post("/auth/forgot-password", { email: email.trim() }, { auth: false });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-14 sm:py-20">
      <h1 className="text-3xl font-extrabold text-fg">Forgot your password?</h1>
      <p className="mt-2 text-sm text-muted">Enter your email and we will send you a link to choose a new one.</p>

      <Card className="mt-8 p-6 sm:p-8">
        {sent ? (
          <div className="flex flex-col items-center text-center">
            <MailCheck className="size-12 text-ok" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-bold text-fg">Check your inbox</h2>
            <p className="mt-2 text-sm text-muted">
              If an account exists for {email.trim()}, a reset link is on its way. It expires in 1 hour.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            {error ? <Alert>{error}</Alert> : null}
            <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!email.includes("@")}>
              Send reset link
            </Button>
          </form>
        )}
      </Card>

      <p className="mt-6 text-center text-sm text-muted">
        <Link to="/login" className="font-semibold text-gold underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/public/ForgotPassword.tsx
// ==========================================