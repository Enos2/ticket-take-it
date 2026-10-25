// ==========================================
// FILE: frontend/src/components/EventGrid.tsx
// PURPOSE: A grid of event cards with loading, error and empty states. Shared by the home and events pages.
// ==========================================
import { CalendarX2 } from "lucide-react";
import { errorMessage } from "../lib/api";
import type { EventSummary } from "../lib/types";
import EventCard from "./EventCard";
import Alert from "./ui/Alert";
import Button from "./ui/Button";
import EmptyState from "./ui/EmptyState";

const gridClass = "grid gap-6 sm:grid-cols-2 lg:grid-cols-3";

function SkeletonCard() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="aspect-video bg-panel-2" />
      <div className="space-y-3 p-5">
        <div className="h-5 w-3/4 rounded bg-panel-2" />
        <div className="h-4 w-1/2 rounded bg-panel-2" />
        <div className="h-4 w-2/3 rounded bg-panel-2" />
      </div>
    </div>
  );
}

interface EventGridProps {
  events: EventSummary[];
  loading: boolean;
  error: unknown; // pass null when there is no error
  onRetry: () => void;
  skeletons?: number;
}

export default function EventGrid({ events, loading, error, onRetry, skeletons = 6 }: EventGridProps) {
  if (loading) {
    return (
      <div className={gridClass}>
        {Array.from({ length: skeletons }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert>{errorMessage(error)}</Alert>
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <EmptyState
        icon={<CalendarX2 className="size-6" aria-hidden="true" />}
        title="No upcoming events yet"
        text="New events are added all the time. Check back soon."
      />
    );
  }

  return (
    <div className={gridClass}>
      {events.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/EventGrid.tsx
// ==========================================