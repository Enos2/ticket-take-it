// ==========================================
// FILE: frontend/src/pages/admin/AdminDashboard.tsx
// PURPOSE: Platform overview for Administrators.
// ==========================================
import { Users, Calendar, DollarSign, ShieldAlert } from "lucide-react";

export default function AdminDashboard() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-text-main mb-8">Platform Overview</h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-dark-surface border border-dark-surface/50 rounded-xl p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-blue-500/10 rounded-lg"><Users size={24} className="text-blue-500" /></div>
            <p className="text-text-muted font-medium">Total Users</p>
          </div>
          <h3 className="text-3xl font-bold text-text-main">12,684</h3>
        </div>

        <div className="bg-dark-surface border border-dark-surface/50 rounded-xl p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-green-500/10 rounded-lg"><Calendar size={24} className="text-green-500" /></div>
            <p className="text-text-muted font-medium">Total Events</p>
          </div>
          <h3 className="text-3xl font-bold text-text-main">1,340</h3>
        </div>

        <div className="bg-dark-surface border border-dark-surface/50 rounded-xl p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-brand-gold/10 rounded-lg"><DollarSign size={24} className="text-brand-gold" /></div>
            <p className="text-text-muted font-medium">Total Sales</p>
          </div>
          <h3 className="text-3xl font-bold text-text-main">KSh 2.4M</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-dark-surface border border-dark-surface/50 rounded-xl p-6">
          <h3 className="text-lg font-bold text-text-main mb-6 flex items-center gap-2"><ShieldAlert size={18} className="text-brand-red"/> Pending Approvals</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-dark-base rounded-lg border border-dark-surface/50">
              <span className="text-text-main text-sm">New Event Requests</span>
              <span className="bg-brand-red text-white text-xs font-bold px-2 py-1 rounded">3</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-dark-base rounded-lg border border-dark-surface/50">
              <span className="text-text-main text-sm">Seller Applications</span>
              <span className="bg-brand-red text-white text-xs font-bold px-2 py-1 rounded">5</span>
            </div>
          </div>
        </div>

        <div className="bg-dark-surface border border-dark-surface/50 rounded-xl p-6">
          <h3 className="text-lg font-bold text-text-main mb-6">Recent Activity</h3>
          <div className="space-y-4">
            <div className="flex gap-4 items-start">
              <div className="w-2 h-2 mt-2 rounded-full bg-green-500"></div>
              <div>
                <p className="text-sm text-text-main">New event <span className="font-bold">"Nairobi After Dark"</span> submitted.</p>
                <p className="text-xs text-text-muted mt-1">2 hours ago</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="w-2 h-2 mt-2 rounded-full bg-brand-gold"></div>
              <div>
                <p className="text-sm text-text-main">Seller verification completed for <span className="font-bold">Vibes Events</span>.</p>
                <p className="text-xs text-text-muted mt-1">5 hours ago</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/admin/AdminDashboard.tsx
// LOCATION: frontend/src/pages/admin/AdminDashboard.tsx
// LAST UPDATED: October 20, 2026
// ==========================================