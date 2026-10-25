// ==========================================
// FILE: frontend/src/components/layout/AccountLayout.tsx
// PURPOSE: Frame for the signed-in area: a heading and tabs for tickets and orders.
// ==========================================
import { NavLink, Outlet } from "react-router-dom";
import { cx } from "../../lib/cx";
import { useAuth } from "../../lib/authStore";

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cx(
    "-mb-px border-b-2 px-1 pb-3 text-sm font-semibold transition-colors",
    isActive ? "border-gold text-gold" : "border-transparent text-muted hover:text-fg"
  );

export default function AccountLayout() {
  const user = useAuth((s) => s.user);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="text-3xl font-extrabold text-fg">My account</h1>
        <p className="mt-1 text-sm text-muted">{user?.email}</p>
      </header>

      <nav className="mb-8 flex gap-6 border-b border-line" aria-label="Account">
        <NavLink to="/account/tickets" className={tabClass}>
          My tickets
        </NavLink>
        <NavLink to="/account/orders" className={tabClass}>
          My orders
        </NavLink>
      </nav>

      <Outlet />
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/layout/AccountLayout.tsx
// ==========================================