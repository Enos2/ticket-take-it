// ==========================================
// FILE: frontend/src/pages/public/Events.tsx
// PURPOSE: Displays all events.
// ==========================================
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../lib/api";

export default function Events() {
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    api.get("/events").then((res) => setEvents(res.data.data));
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Upcoming Events</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {events.map((event) => (
          <div key={event.id} className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition">
            <h2 className="text-xl font-bold mb-2">{event.title}</h2>
            <p className="text-gray-600 mb-4">{event.venue}, {event.city}</p>
            <Link to={`/events/${event.id}`} className="text-brand-600 font-semibold hover:underline">
              View Tickets &rarr;
            </Link>
          </div>
        ))}
        {events.length === 0 && <p className="col-span-3 text-gray-500">No events found. (Create one via the API!)</p>}
      </div>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/public/Events.tsx
// LOCATION: frontend/src/pages/public/Events.tsx
// LAST UPDATED: October 19, 2026
// ==========================================