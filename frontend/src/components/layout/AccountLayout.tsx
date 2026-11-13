// ==========================================
// FILE: frontend/src/components/layout/AccountLayout.tsx
// PURPOSE: Frame for the signed-in area: a heading and tabs for tickets, orders, transfers and settings.
// ==========================================
import { NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { cx } from "../../lib/cx";
import { useAuth } from "../../lib/authStore";
import type { TransfersOverview } from "../../lib/transfers";

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cx(
    "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 text-sm font-semibold transition-colors",
    isActive ? "border-gold text-gold" : "border-transparent text-muted hover:text-fg"
  );

export default function AccountLayout() {
  const user = useAuth((s) => s.user);

  // Shows how many tickets other people sent that are waiting for an answer.
  const transfers = useQuery({
    queryKey: ["transfers"],
    queryFn: () => api.get<TransfersOverview>("/transfers"),
    refetchInterval: 60_000,
  });
  const waiting = transfers.data?.incoming.length ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="text-3xl font-extrabold text-fg">My account</h1>
        <p className="mt-1 text-sm text-muted">{user?.email}</p>
      </header>

      <nav className="mb-8 flex gap-6 overflow-x-auto border-b border-line" aria-label="Account">
        <NavLink to="/account/tickets" className={tabClass}>
          My tickets
        </NavLink>
        <NavLink to="/account/orders" className={tabClass}>
          My orders
        </NavLink>
        <NavLink to="/account/transfers" className={tabClass}>
          Transfers
          {waiting > 0 ? (
            <span className="rounded-full bg-gold px-1.5 py-0.5 text-xs leading-none font-bold text-ink" aria-label={`${waiting} waiting`}>
              {waiting}
            </span>
          ) : null}
        </NavLink>
        <NavLink to="/account/saved" className={tabClass}>
          Saved
        </NavLink>
        <NavLink to="/account/settings" className={tabClass}>
          Settings
        </NavLink>
      </nav>

      <Outlet />
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/layout/AccountLayout.tsx
// ==========================================