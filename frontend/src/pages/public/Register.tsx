// ==========================================
// FILE: frontend/src/pages/public/Register.tsx
// PURPOSE: Create an account. Needs agreement to the terms.
// ==========================================
import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { Check, Circle } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import { Field, PasswordField } from "../../components/ui/Field";
import { errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/authStore";
import { cx } from "../../lib/cx";
import { useTitle } from "../../lib/useTitle";

// The same rules the server enforces.
const RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "An uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "A lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "A number", test: (p: string) => /[0-9]/.test(p) },
  { label: "At most 72 bytes", test: (p: string) => new TextEncoder().encode(p).length <= 72 },
];

const link = "font-semibold text-gold underline-offset-4 hover:underline";

export default function Register() {
  useTitle("Create account");

  const status = useAuth((s) => s.status);
  const register = useAuth((s) => s.register);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === "authenticated") return <Navigate to="/" replace />;

  const passwordOk = RULES.every((rule) => rule.test(password));
  const canSubmit = fullName.trim().length >= 2 && email.includes("@") && passwordOk && agreed;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      await register({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
        acceptedTerms: true,
      });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-14 sm:py-20">
      <h1 className="text-3xl font-extrabold text-fg">Create your account</h1>
      <p className="mt-2 text-sm text-muted">It takes a minute, and you will need it to buy tickets.</p>

      <Card className="mt-8 p-6 sm:p-8">
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {error ? <Alert>{error}</Alert> : null}

          <Field label="Full name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
          <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Field
            label="Phone (optional)"
            type="tel"
            autoComplete="tel"
            placeholder="0712 345 678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <div>
            <PasswordField
              label="Password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <ul className="mt-3 grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
              {RULES.map((rule) => {
                const ok = rule.test(password);
                return (
                  <li key={rule.label} className={cx("flex items-center gap-1.5", ok ? "text-ok" : "text-muted")}>
                    {ok ? <Check className="size-3.5" aria-hidden="true" /> : <Circle className="size-3.5" aria-hidden="true" />}
                    {rule.label}
                  </li>
                );
              })}
            </ul>
          </div>

          <label className="flex cursor-pointer items-start gap-3 text-sm text-muted">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-brand" />
            <span>
              I agree to the{" "}
              <Link to="/terms" target="_blank" className={link}>
                Terms of Service
              </Link>{" "}
              and have read the{" "}
              <Link to="/privacy" target="_blank" className={link}>
                Privacy Policy
              </Link>
              .
            </span>
          </label>

          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!canSubmit}>
            Create account
          </Button>
        </form>
      </Card>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link to="/login" className={link}>
          Sign in
        </Link>
      </p>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/public/Register.tsx
// ==========================================