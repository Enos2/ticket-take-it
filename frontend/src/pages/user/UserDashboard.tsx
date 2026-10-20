// ==========================================
// FILE: frontend/src/pages/user/UserDashboard.tsx
// PURPOSE: The buyer's "My Tickets" page with correct colors.
// ==========================================
import { useEffect, useState } from "react";
import api from "../../lib/api";
import { Link } from "react-router-dom";
import { Ticket } from "lucide-react";

export default function UserDashboard() {
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    api.get("/orders/my-orders")
      .then((res) => setOrders(res.data.data))
      .catch(() => setOrders([])); 
  }, []);

  return (
    <div>
      <div className="flex justify-between items-center mb-8 border-b border-dark-surface/50 pb-4">
        <h2 className="text-2xl font-bold text-text-main">My Tickets</h2>
        <div className="flex gap-6 text-sm font-medium">
          <button className="text-brand-red border-b-2 border-brand-red pb-4 -mb-4.5">Upcoming</button>
          <button className="text-text-muted hover:text-text-main pb-4 transition">Past</button>
          <button className="text-text-muted hover:text-text-main pb-4 transition">Cancelled</button>
        </div>
      </div>

      <div className="space-y-4">
        {orders.length === 0 ? (
          <div className="bg-dark-surface border border-dark-surface/50 rounded-xl p-12 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-dark-base rounded-full flex items-center justify-center mb-4 border border-dark-surface">
                <Ticket size={24} className="text-text-muted" />
            </div>
            <p className="text-text-muted mb-6">You don't have any upcoming tickets yet.</p>
            <Link to="/events" className="bg-brand-red text-white px-6 py-2.5 rounded-md font-bold hover:bg-brand-red/90 transition">Find Events</Link>
          </div>
        ) : (
          orders.map((order) => (
            <div key={order.id} className="bg-dark-surface border border-dark-surface/50 rounded-xl p-4 flex items-center gap-6">
              <div className="w-20 h-20 bg-brand-red/10 rounded-lg flex items-center justify-center border border-brand-red/20">
                <Ticket size={32} className="text-brand-red" />
              </div>
              
              <div className="flex-1">
                <p className="text-brand-gold text-xs font-bold mb-1 tracking-wider">{order.reference}</p>
                <h3 className="text-lg font-bold text-text-main">{order.items[0]?.ticketType?.event?.title || "Event Name"}</h3>
                <p className="text-text-muted text-sm mt-1">{order.items[0]?.ticketType?.name} • Qty: {order.items[0]?.quantity}</p>
              </div>

              <button className="text-sm font-bold text-text-main border border-dark-surface/50 px-5 py-2.5 rounded-md hover:bg-dark-base transition">
                View Ticket
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/user/UserDashboard.tsx
// LOCATION: frontend/src/pages/user/UserDashboard.tsx
// LAST UPDATED: October 20, 2026
// ==========================================