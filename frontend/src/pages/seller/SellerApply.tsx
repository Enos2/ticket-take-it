// ==========================================
// FILE: frontend/src/pages/seller/SellerApply.tsx
// PURPOSE: Apply to become a seller.
// ==========================================
import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { CalendarPlus, QrCode, ShieldCheck } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import { Field } from "../../components/ui/Field";
import { api, errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/authStore";
import { useTitle } from "../../lib/useTitle";
import type { SellerProfile } from "../../lib/types";

const PERKS = [
  { icon: CalendarPlus, text: "Create events and set up early bird, VIP and group tickets" },
  { icon: ShieldCheck, text: "Get paid securely by card and M-Pesa, with no double bookings" },
  { icon: QrCode, text: "Check people in at the door with your phone camera" },
];

export default function SellerApply() {
  useTitle("Sell tickets");

  const user = useAuth((s) => s.user);
  const reloadUser = useAuth((s) => s.reloadUser);
  const navigate = useNavigate();

  const [businessName, setBusinessName] = useState("");
  const [businessEmail, setBusinessEmail] = useState(user?.email ?? "");
  const [businessPhone, setBusinessPhone] = useState(user?.phone ?? "");
  const [error, setError] = useState<string | null>(null);

  const apply = useMutation({
    mutationFn: () =>
      api.post<SellerProfile>("/sellers/onboard", {
        businessName: businessName.trim(),
        businessEmail: businessEmail.trim(),
        businessPhone: businessPhone.trim() || undefined,
      }),
    onSuccess: async () => {
      await reloadUser(); // the account is now a seller account, with a pending application
      navigate("/seller", { replace: true });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (user?.role === "ADMIN") return <Navigate to="/" replace />;
  if (user?.sellerProfile) return <Navigate to="/seller" replace />;

  const phone = businessPhone.trim();
  const phoneOk = !phone || /^\+?[0-9\s-]{6,20}$/.test(phone);
  const canSubmit = businessName.trim().length >= 2 && businessEmail.includes("@") && phoneOk;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    apply.mutate();
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:py-20">
      <div>
        <p className="text-sm font-semibold tracking-widest text-gold uppercase">Become a seller</p>
        <h1 className="mt-2 text-3xl font-extrabold text-fg sm:text-4xl">Sell tickets to your event</h1>
        <p className="mt-4 text-muted">
          Tell us about your business. We review every application, usually quickly, and email you the decision.
        </p>

        <ul className="mt-8 space-y-4">
          {PERKS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-sm text-muted">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-panel text-gold">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="pt-1.5">{text}</span>
            </li>
          ))}
        </ul>
      </div>

      <Card className="p-6 sm:p-8">
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {error ? <Alert>{error}</Alert> : null}

          <Field
            label="Business or organiser name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            maxLength={100}
            required
            autoFocus
          />
          <Field
            label="Business email"
            type="email"
            autoComplete="email"
            value={businessEmail}
            onChange={(e) => setBusinessEmail(e.target.value)}
            hint="Where we contact you about your seller account."
            required
          />
          <Field
            label="Business phone (optional)"
            type="tel"
            autoComplete="tel"
            placeholder="0712 345 678"
            value={businessPhone}
            onChange={(e) => setBusinessPhone(e.target.value)}
            error={phone && !phoneOk ? "Use digits, spaces, dashes and an optional leading +" : undefined}
          />

          <Button type="submit" size="lg" className="w-full" loading={apply.isPending} disabled={!canSubmit}>
            Submit application
          </Button>
        </form>
      </Card>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/seller/SellerApply.tsx
// ==========================================