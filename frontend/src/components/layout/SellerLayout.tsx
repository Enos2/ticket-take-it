// ==========================================
// FILE: frontend/src/components/layout/SellerLayout.tsx
// PURPOSE: Frame for the seller area. Shows the right screen for each stage of a seller application.
// ==========================================
import { useState } from "react";
import { Link, NavLink, Navigate, Outlet } from "react-router-dom";
import { Ban, Clock, QrCode, Store } from "lucide-react";
import { cx } from "../../lib/cx";
import { useAuth } from "../../lib/authStore";
import Button from "../ui/Button";
import Card from "../ui/Card";
import EmptyState from "../ui/EmptyState";
import { buttonClasses } from "../ui/styles";

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cx(
    "-mb-px border-b-2 px-1 pb-3 text-sm font-semibold transition-colors",
    isActive ? "border-gold text-gold" : "border-transparent text-muted hover:text-fg"
  );

export default function SellerLayout() {
  const user = useAuth((s) => s.user);
  const reloadUser = useAuth((s) => s.reloadUser);
  const [checking, setChecking] = useState(false);

  if (!user) return null; // ProtectedRoute only lets signed-in people reach this

  if (user.role === "ADMIN") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={<Store className="size-6" aria-hidden="true" />}
          title="This area is for sellers"
          text="Administrators manage sellers and events from the admin area."
          action={
            <Link to="/" className={buttonClasses("secondary")}>
              Back to home
            </Link>
          }
        />
      </div>
    );
  }

  const profile = user.sellerProfile;
  if (!profile) return <Navigate to="/seller/apply" replace />;

  if (profile.status === "PENDING") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <Card className="flex flex-col items-center p-8 text-center">
          <Clock className="size-12 text-gold" aria-hidden="true" />
          <h1 className="mt-5 text-2xl font-extrabold text-fg">Your application is under review</h1>
          <p className="mt-3 text-sm text-muted">
            Thank you for applying as <span className="font-semibold text-fg">{profile.businessName}</span>. We check every seller
            before they can publish events. You will get an email as soon as there is a decision.
          </p>
          <Button
            variant="secondary"
            className="mt-6"
            loading={checking}
            onClick={async () => {
              setChecking(true);
              await reloadUser();
              setChecking(false);
            }}
          >
            Check my status
          </Button>
        </Card>
      </div>
    );
  }

  if (profile.status === "REJECTED" || profile.status === "SUSPENDED") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <Card className="flex flex-col items-center p-8 text-center">
          <Ban className="size-12 text-brand" aria-hidden="true" />
          <h1 className="mt-5 text-2xl font-extrabold text-fg">
            {profile.status === "REJECTED" ? "Your application was not approved" : "Your seller account is suspended"}
          </h1>
          <p className="mt-3 text-sm text-muted">
            {profile.status === "REJECTED"
              ? "We could not approve the seller application for this business at this time."
              : "You can't create or manage events while the account is suspended."}{" "}
            Please contact the Ticket Take It team if you think this is a mistake.
          </p>
          <Link to="/" className={`${buttonClasses("secondary")} mt-6`}>
            Back to home
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <p className="text-sm font-semibold tracking-widest text-gold uppercase">Seller area</p>
        <h1 className="mt-1 text-3xl font-extrabold text-fg">{profile.businessName}</h1>
      </header>

      <nav className="mb-8 flex gap-6 border-b border-line" aria-label="Seller">
        <NavLink to="/seller" end className={tabClass}>
          My events
        </NavLink>
        <NavLink to="/seller/orders" className={tabClass}>
          Orders
        </NavLink>
        <NavLink to="/seller/scan" className={tabClass}>
          <span className="inline-flex items-center gap-1.5">
            <QrCode className="size-4" aria-hidden="true" />
            Scan tickets
          </span>
        </NavLink>
      </nav>

      <Outlet />
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/layout/SellerLayout.tsx
// ==========================================