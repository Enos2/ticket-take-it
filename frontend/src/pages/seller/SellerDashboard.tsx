// ==========================================
// FILE: frontend/src/pages/seller/SellerDashboard.tsx
// PURPOSE: Main dashboard for Event Organizers.
// ==========================================
import { Link } from "react-router-dom";
import { PlusCircle, TrendingUp, Users, DollarSign } from "lucide-react";

export default function SellerDashboard() {
  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-text-main">Dashboard Overview</h2>
          <p className="text-text-muted text-sm mt-1">Track your sales and performance.</p>
        </div>
        <Link to="/seller/create-event" className="bg-brand-red text-white px-5 py-2.5 rounded-md font-bold hover:bg-brand-red/90 transition flex items-center gap-2">
          <PlusCircle size={18} /> Create Event
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-dark-surface border border-dark-surface/50 rounded-xl p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-text-muted text-sm font-medium">Total Sales</p>
              <h3 className="text-2xl font-bold text-text-main mt-1">KSh 0</h3>
            </div>
            <div className="p-2 bg-brand-gold/10 rounded-lg"><DollarSign size={20} className="text-brand-gold" /></div>
          </div>
          <p className="text-xs text-brand-red flex items-center gap-1"><TrendingUp size={14} /> +0% from last month</p>
        </div>

        <div className="bg-dark-surface border border-dark-surface/50 rounded-xl p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-text-muted text-sm font-medium">Tickets Sold</p>
              <h3 className="text-2xl font-bold text-text-main mt-1">0</h3>
            </div>
            <div className="p-2 bg-brand-gold/10 rounded-lg"><Users size={20} className="text-brand-gold" /></div>
          </div>
          <p className="text-xs text-text-muted">Across all events</p>
        </div>
      </div>

      {/* Placeholder for Chart */}
      <div className="bg-dark-surface border border-dark-surface/50 rounded-xl p-6 h-80 flex flex-col">
        <h3 className="text-lg font-bold text-text-main mb-6">Sales Overview</h3>
        <div className="flex-1 border border-dark-surface/50 border-dashed rounded-lg flex items-center justify-center">
          <p className="text-text-muted text-sm">Chart integration will go here</p>
        </div>
      </div>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/seller/SellerDashboard.tsx
// LOCATION: frontend/src/pages/seller/SellerDashboard.tsx
// LAST UPDATED: October 20, 2026
// ==========================================