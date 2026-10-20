// ==========================================
// FILE: frontend/src/pages/public/EventDetail.tsx
// PURPOSE: Shows full event details and ticket selection.
// ==========================================
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../lib/api";

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState<any>(null);

  useEffect(() => {
    // In a real app, we'd fetch a single event endpoint. 
    // For now, we'll fetch all and find the one we need.
    api.get("/events").then((res) => {
      const found = res.data.data.find((e: any) => e.id === id);
      setEvent(found);
    });
  }, [id]);

  if (!event) return <div className="text-center mt-20 text-white">Loading...</div>;

  return (
    <div className="max-w-7xl mx-auto p-6 mt-6">
      {/* Banner */}
      <div className="w-full h-100 rounded-2xl overflow-hidden relative mb-8 border border-dark-700">
        <img src={event.bannerUrl || "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4"} alt={event.title} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-linear-to-t from-dark-900 to-transparent"></div>
        <div className="absolute bottom-8 left-8">
          <span className="bg-brand-red text-white text-xs font-bold px-3 py-1 rounded mb-4 inline-block">MUSIC</span>
          <h1 className="text-5xl font-black text-white">{event.title}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Left Side: Details */}
        <div className="lg:col-span-2">
          <div className="flex gap-6 text-gray-300 mb-8 border-b border-dark-700 pb-6">
            <div className="flex items-center gap-2"><span className="text-brand-red">📅</span> {new Date(event.startsAt).toLocaleString()}</div>
            <div className="flex items-center gap-2"><span className="text-brand-red">📍</span> {event.venue}, {event.city}</div>
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-4">About this event</h2>
          <p className="text-gray-400 leading-relaxed mb-8">{event.description}</p>
        </div>

        {/* Right Side: Ticket Box */}
        <div className="lg:col-span-1">
          <div className="bg-dark-800 border border-dark-700 rounded-2xl p-6 sticky top-24">
            <h3 className="text-xl font-bold text-white mb-6">Select Ticket Type</h3>
            
            <div className="space-y-4 mb-8">
              {event.ticketTypes?.map((ticket: any) => (
                <div key={ticket.id} className="border border-dark-700 bg-dark-900 rounded-xl p-4 hover:border-brand-red cursor-pointer transition">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-white">{ticket.name}</span>
                    <span className="text-brand-red font-bold">KSh {(ticket.priceCents / 100).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-gray-400">{ticket.tier} • {ticket.quantity - ticket.sold} tickets left</p>
                </div>
              ))}
            </div>

            <button 
              onClick={() => navigate("/login")} // Will navigate to checkout later
              className="w-full bg-brand-red text-white py-4 rounded-xl font-bold text-lg hover:bg-brand-hover transition shadow-[0_0_15px_rgba(239,68,68,0.3)]"
            >
              Proceed to Payment
            </button>
            <p className="text-center text-xs text-gray-500 mt-4">🔒 Secured payment powered by Ticket Take It</p>
          </div>
        </div>
      </div>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/public/EventDetail.tsx
// LOCATION: frontend/src/pages/public/EventDetail.tsx
// LAST UPDATED: October 20, 2026
// ==========================================