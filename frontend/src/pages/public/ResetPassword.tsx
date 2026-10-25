// ==========================================
// FILE: frontend/src/pages/public/ResetPassword.tsx
// PURPOSE: Choose a new password from the emailed link.
// ==========================================
import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import { PasswordField } from "../../components/ui/Field";
import { buttonClasses } from "../../components/ui/styles";
import { api, errorMessage } from "../../lib/api";
import { useTitle } from "../../lib/useTitle";

const passwordProblem = (p: string): string | null => {
  if (p.length < 8) return "Use at least 8 characters";
  if (!/[A-Z]/.test(p)) return "Add an uppercase letter";
  if (!/[a-z]/.test(p)) return "Add a lowercase letter";
  if (!/[0-9]/.test(p)) return "Add a number";
  if (new TextEncoder().encode(p).length > 72) return "Use at most 72 bytes";
  return null;
};

export default function ResetPassword() {
  useTitle("Choose a new password");

  const [params] = useSearchParams();
  const token = params.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const problem = password ? passwordProblem(password) : null;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = Boolean(token) && password.length > 0 && !problem && confirm === password;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      await api.post("/auth/reset-password", { token, password }, { auth: false });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <Alert>This link is missing its token. Open the link from your email again, or request a new one.</Alert>
        <Link to="/forgot-password" className={`${buttonClasses("secondary")} mt-6`}>
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-14 sm:py-20">
      <h1 className="text-3xl font-extrabold text-fg">Choose a new password</h1>
      <p className="mt-2 text-sm text-muted">You will be signed out everywhere else once you save it.</p>

      <Card className="mt-8 p-6 sm:p-8">
        {done ? (
          <div className="flex flex-col items-center text-center">
            <CheckCircle2 className="size-12 text-ok" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-bold text-fg">Password updated</h2>
            <p className="mt-2 text-sm text-muted">You can now sign in with your new password.</p>
            <Link to="/login" className={`${buttonClasses("primary")} mt-6`}>
              Sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            {error ? <Alert>{error}</Alert> : null}
            <PasswordField
              label="New password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={problem ?? undefined}
              hint="At least 8 characters with an uppercase letter, a lowercase letter and a number."
              required
              autoFocus
            />
            <PasswordField
              label="Confirm new password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              error={mismatch ? "The passwords don't match" : undefined}
              required
            />
            <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!canSubmit}>
              Save new password
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/public/ResetPassword.tsx
// ==========================================