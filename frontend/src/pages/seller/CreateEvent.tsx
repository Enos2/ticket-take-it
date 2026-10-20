// ==========================================
// FILE: frontend/src/pages/seller/CreateEvent.tsx
// PURPOSE: Form for sellers to create a new event.
// ==========================================
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../lib/api";

export default function CreateEvent() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    venue: "",
    city: "",
    country: "Kenya",
    startsAt: "",
    endsAt: "",
  });
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Format dates to ISO strings for the backend
      const payload = {
        ...formData,
        startsAt: new Date(formData.startsAt).toISOString(),
        endsAt: new Date(formData.endsAt).toISOString(),
      };
      
      await api.post("/events", payload);
      navigate("/dashboard"); // Redirect after success
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to create event");
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-text-main mb-6">Create New Event</h2>
      
      {error && <div className="bg-brand-red/10 border border-brand-red text-brand-red p-4 rounded-lg mb-6">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6 bg-dark-surface p-8 rounded-xl border border-dark-surface/50">
        <div>
          <label className="block text-sm font-medium text-text-muted mb-2">Event Title</label>
          <input type="text" required className="w-full bg-dark-base border border-dark-surface rounded-md p-3 text-text-main focus:border-brand-red outline-none transition" 
            value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-muted mb-2">Description</label>
          <textarea required rows={4} className="w-full bg-dark-base border border-dark-surface rounded-md p-3 text-text-main focus:border-brand-red outline-none transition"
            value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}></textarea>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Venue</label>
            <input type="text" required className="w-full bg-dark-base border border-dark-surface rounded-md p-3 text-text-main focus:border-brand-red outline-none transition"
              value={formData.venue} onChange={e => setFormData({...formData, venue: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">City</label>
            <input type="text" required className="w-full bg-dark-base border border-dark-surface rounded-md p-3 text-text-main focus:border-brand-red outline-none transition"
              value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Start Date & Time</label>
            <input type="datetime-local" required className="w-full bg-dark-base border border-dark-surface rounded-md p-3 text-text-main focus:border-brand-red outline-none transition"
              value={formData.startsAt} onChange={e => setFormData({...formData, startsAt: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">End Date & Time</label>
            <input type="datetime-local" required className="w-full bg-dark-base border border-dark-surface rounded-md p-3 text-text-main focus:border-brand-red outline-none transition"
              value={formData.endsAt} onChange={e => setFormData({...formData, endsAt: e.target.value})} />
          </div>
        </div>

        <button type="submit" className="w-full bg-brand-red text-white py-3 rounded-md font-bold hover:bg-brand-red/90 transition mt-4">
          Publish Event
        </button>
      </form>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/seller/CreateEvent.tsx
// LOCATION: frontend/src/pages/seller/CreateEvent.tsx
// LAST UPDATED: October 20, 2026
// ==========================================