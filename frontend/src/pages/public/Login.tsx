// ==========================================
// FILE: frontend/src/pages/public/Login.tsx
// PURPOSE: Sign in.
// ==========================================
import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import { Field, PasswordField } from "../../components/ui/Field";
import { errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/authStore";
import { useTitle } from "../../lib/useTitle";

export default function Login() {
  useTitle("Sign in");

  const status = useAuth((s) => s.status);
  const login = useAuth((s) => s.login);
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Signed in (including right after a successful login): go where they were headed.
  if (status === "authenticated") return <Navigate to={from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-14 sm:py-20">
      <h1 className="text-3xl font-extrabold text-fg">Welcome back</h1>
      <p className="mt-2 text-sm text-muted">Sign in to see your tickets and orders.</p>

      <Card className="mt-8 p-6 sm:p-8">
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {error ? <Alert>{error}</Alert> : null}

          <Field
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />

          <PasswordField
            label="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-sm text-gold underline-offset-4 hover:underline">
              Forgot your password?
            </Link>
          </div>

          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!email || !password}>
            Sign in
          </Button>
        </form>
      </Card>

      <p className="mt-6 text-center text-sm text-muted">
        New here?{" "}
        <Link to="/register" className="font-semibold text-gold underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/public/Login.tsx
// ==========================================