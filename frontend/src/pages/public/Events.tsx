// ==========================================
// FILE: frontend/src/pages/public/Events.tsx
// PURPOSE: Event listing with premium colors.
// ==========================================
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../lib/api";
import { MapPin, Calendar } from "lucide-react";

export default function Events() {
  const [events, setEvents] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.get("/events").then((res) => setEvents(res.data.data));
  }, []);

  return (
    <div className="max-w-7xl mx-auto p-6 mt-8">
      {/* Search & Filters */}
      <div className="mb-10">
        <div className="flex gap-4 mb-6">
          <input 
            type="text" 
            placeholder="Search events, artists, venues..." 
            className="flex-1 bg-dark-surface border border-dark-surface/50 rounded-lg p-4 text-text-main focus:outline-none focus:border-brand-red/50 transition"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="bg-brand-red px-8 rounded-lg font-bold text-white hover:bg-brand-red/90 transition">Search</button>
        </div>
        
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {["All Events", "Music", "Nightlife", "Business", "Arts", "Food & Drink", "Sports"].map((cat) => (
            <button key={cat} className={`px-5 py-2.5 rounded-full text-sm font-medium border transition ${cat === "All Events" ? "bg-brand-red border-brand-red text-white" : "bg-dark-surface border-dark-surface/50 text-text-muted hover:text-text-main"}`}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Event Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {events.map((event) => (
          <div key={event.id} className="bg-dark-surface rounded-xl overflow-hidden border border-dark-surface/50 group">
            <div className="h-48 bg-dark-base relative">
              <img src={event.bannerUrl || "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4"} alt={event.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
              <div className="absolute top-4 left-4 bg-dark-base/90 backdrop-blur-md px-3 py-1 rounded text-xs font-bold text-brand-gold uppercase tracking-wider border border-brand-gold/20">Featured</div>
            </div>
            
            <div className="p-5">
              <div className="text-text-muted text-xs font-medium mb-2 flex items-center gap-2">
                <Calendar size={14} className="text-brand-red" />
                <span>{new Date(event.startsAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                <span className="text-dark-surface/50">•</span>
                <MapPin size={14} className="text-brand-red" />
                <span>{event.venue}</span>
              </div>
              <h3 className="text-lg font-bold text-text-main mb-4 line-clamp-2">{event.title}</h3>
              
              <div className="flex justify-between items-center mt-6 pt-4 border-t border-dark-base/50">
                <div>
                  <p className="text-text-muted text-xs mb-1">From</p>
                  <p className="text-text-main font-bold">
                    {event.ticketTypes?.[0] ? `KSh ${(event.ticketTypes[0].priceCents / 100).toLocaleString()}` : 'TBA'}
                  </p>
                </div>
                <Link to={`/events/${event.id}`} className="bg-dark-base hover:bg-brand-red text-text-main px-5 py-2.5 rounded-md font-semibold transition text-sm border border-dark-surface hover:border-brand-red">
                  Get Tickets
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/public/Events.tsx
// LOCATION: frontend/src/pages/public/Events.tsx
// LAST UPDATED: October 20, 2026
// ==========================================