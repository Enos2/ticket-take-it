// ==========================================
// FILE: frontend/src/components/RecentlyViewed.tsx
// PURPOSE: A row of the events this person looked at recently. Hidden when there are none.
// ==========================================
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { readRecent } from "../lib/recent";
import type { EventSummary } from "../lib/types";
import EventCard from "./EventCard";

export default function RecentlyViewed({ exclude }: { exclude?: string }) {
  // Read once, so the row doesn't reshuffle while the page is open.
  const [slugs] = useState(() => readRecent().filter((s) => s !== exclude).slice(0, 4));

  const query = useQuery({
    queryKey: ["events", "recent", slugs.join(",")],
    queryFn: () => api.get<EventSummary[]>(`/events/lookup?slugs=${slugs.join(",")}`),
    enabled: slugs.length > 0,
  });

  const events = query.data ?? [];
  if (events.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6" aria-label="Recently viewed">
      <h2 className="mb-6 text-2xl font-bold text-fg">Recently viewed</h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </section>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/RecentlyViewed.tsx
// ==========================================