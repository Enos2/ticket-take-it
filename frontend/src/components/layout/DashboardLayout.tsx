// ==========================================
// FILE: frontend/src/components/layout/DashboardLayout.tsx
// PURPOSE: Reusable sidebar layout with professional SVG icons.
// ==========================================
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../../lib/authStore";
import { Ticket, Settings, LogOut, User } from "lucide-react";

export default function DashboardLayout() {
  const { user, logout } = useAuthStore();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-dark-base flex font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-dark-surface border-r border-dark-surface/50 hidden md:flex flex-col">
        <div className="p-6 border-b border-dark-surface/50">
          <Link to="/" className="text-xl font-black text-text-main flex items-center gap-2">
            <span className="text-brand-red text-2xl leading-none">●</span> Ticket Take It
          </Link>
        </div>
        
        <div className="p-4 flex-1">
          <div className="mb-6 px-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-dark-base flex items-center justify-center border border-dark-surface">
                <User size={18} className="text-text-muted" />
            </div>
            <div>
                <p className="text-sm font-bold text-text-main truncate w-32">{user?.email}</p>
                <p className="text-xs text-brand-gold tracking-wider uppercase mt-0.5">{user?.role}</p>
            </div>
          </div>

          <nav className="space-y-2 mt-8">
            <Link to="/dashboard" className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${isActive('/dashboard') ? 'bg-brand-red/10 text-brand-red border-l-2 border-brand-red' : 'text-text-muted hover:bg-dark-base/50 hover:text-text-main'}`}>
              <Ticket size={18} /> My Tickets
            </Link>
            <Link to="/dashboard/settings" className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${isActive('/dashboard/settings') ? 'bg-brand-red/10 text-brand-red border-l-2 border-brand-red' : 'text-text-muted hover:bg-dark-base/50 hover:text-text-main'}`}>
              <Settings size={18} /> Settings
            </Link>
          </nav>
        </div>

        <div className="p-4 border-t border-dark-surface/50">
          <button onClick={logout} className="flex items-center gap-3 px-4 py-3 w-full text-left rounded-lg text-sm font-medium text-text-muted hover:bg-dark-base/50 hover:text-brand-red transition">
            <LogOut size={18} /> Log out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-dark-surface border-b border-dark-surface/50 px-8 py-5 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-text-main tracking-tight">Dashboard</h1>
          <div className="flex items-center gap-4">
             <div className="w-9 h-9 rounded-full bg-brand-red flex items-center justify-center text-white font-bold text-sm shadow-sm cursor-pointer hover:opacity-90 transition">
                {user?.email?.[0].toUpperCase() || "U"}
             </div>
          </div>
        </header>
        
        <div className="p-8 overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/layout/DashboardLayout.tsx
// LOCATION: frontend/src/components/layout/DashboardLayout.tsx
// LAST UPDATED: October 20, 2026
// ==========================================