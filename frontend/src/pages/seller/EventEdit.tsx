// ==========================================
// FILE: frontend/src/pages/seller/EventEdit.tsx
// PURPOSE: Edit an event's details.
// ==========================================
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import EventForm from "../../components/EventForm";
import Alert from "../../components/ui/Alert";
import Card from "../../components/ui/Card";
import { api, errorMessage } from "../../lib/api";
import { eventToFormValues } from "../../lib/eventForm";
import type { EventPayload } from "../../lib/eventForm";
import { canEditEvent } from "../../lib/seller";
import { useInvalidateEvent } from "../../lib/useInvalidateEvent";
import { useManagedEvent } from "../../lib/useManagedEvent";
import { useTitle } from "../../lib/useTitle";
import type { SellerEvent } from "../../lib/types";

export default function EventEdit() {
  const { event } = useManagedEvent();
  useTitle(`${event.title} · Details`);

  const invalidate = useInvalidateEvent();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (payload: EventPayload) => api.patch<SellerEvent>(`/events/${event.id}`, payload),
    onSuccess: () => {
      invalidate(event);
      setError(null);
      setSaved(true);
    },
    onError: (err) => {
      setSaved(false);
      setError(errorMessage(err));
    },
  });

  if (!canEditEvent(event)) {
    return <Alert variant="info">This event has ended or was cancelled, so its details can no longer be changed.</Alert>;
  }

  return (
    <div className="max-w-3xl">
      {saved ? (
        <div className="mb-6">
          <Alert variant="success">Your changes are saved.</Alert>
        </div>
      ) : null}

      <Card className="p-6 sm:p-8">
        {/* The key restarts the form with the saved values after each save. */}
        <EventForm
          key={`${event.id}-${event.title}-${event.startsAt}-${event.endsAt}-${event.description.length}-${event.venue}-${event.city}-${event.country}-${event.bannerUrl ?? ""}`}
          initial={eventToFormValues(event)}
          submitLabel="Save changes"
          busy={save.isPending}
          error={error}
          onSubmit={(payload) => {
            setSaved(false);
            setError(null);
            save.mutate(payload);
          }}
        />
      </Card>

      <p className="mt-4 text-xs text-muted">
        The event's web address stays the same when you change the title, so links you have shared keep working.
      </p>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/seller/EventEdit.tsx
// ==========================================