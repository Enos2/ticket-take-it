// ==========================================
// FILE: frontend/src/components/layout/AdminLayout.tsx
// PURPOSE: Frame for the admin area, with tabs that show how much work is waiting.
// ==========================================
import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet } from "react-router-dom";
import { api } from "../../lib/api";
import { cx } from "../../lib/cx";
import type { AdminStats } from "../../lib/adminTypes";

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cx(
    "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 text-sm font-semibold transition-colors",
    isActive ? "border-gold text-gold" : "border-transparent text-muted hover:text-fg"
  );

function Count({ value }: { value: number | undefined }) {
  if (!value) return null;
  return (
    <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white tabular-nums" aria-label={`${value} waiting`}>
      {value}
    </span>
  );
}

export default function AdminLayout() {
  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => api.get<AdminStats>("/admin/stats"),
    refetchInterval: 60_000,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <p className="text-sm font-semibold tracking-widest text-gold uppercase">Admin area</p>
        <h1 className="mt-1 text-3xl font-extrabold text-fg">Ticket Take It control room</h1>
      </header>

      <nav className="mb-8 flex gap-6 overflow-x-auto border-b border-line" aria-label="Admin">
        <NavLink to="/admin" end className={tabClass}>
          Overview
        </NavLink>
        <NavLink to="/admin/sellers" className={tabClass}>
          Sellers
          <Count value={stats.data?.pendingSellers} />
        </NavLink>
        <NavLink to="/admin/events" className={tabClass}>
          Events
        </NavLink>
        <NavLink to="/admin/orders" className={tabClass}>
          Orders
        </NavLink>
        <NavLink to="/admin/refunds" className={tabClass}>
          Refunds
          <Count value={stats.data?.paymentsNeedingRefund} />
        </NavLink>
        <NavLink to="/admin/users" className={tabClass}>
          Users
        </NavLink>
      </nav>

      <Outlet />
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/layout/AdminLayout.tsx
// ==========================================