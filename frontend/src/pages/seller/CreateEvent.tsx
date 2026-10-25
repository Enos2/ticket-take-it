// ==========================================
// FILE: frontend/src/pages/seller/CreateEvent.tsx
// PURPOSE: Create a new event as a draft.
// ==========================================
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import EventForm from "../../components/EventForm";
import Card from "../../components/ui/Card";
import { api, errorMessage } from "../../lib/api";
import { useInvalidateEvent } from "../../lib/useInvalidateEvent";
import { useTitle } from "../../lib/useTitle";
import type { EventPayload } from "../../lib/eventForm";
import type { SellerEvent } from "../../lib/types";

export default function CreateEvent() {
  useTitle("Create event");

  const navigate = useNavigate();
  const invalidate = useInvalidateEvent();
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (payload: EventPayload) => api.post<SellerEvent>("/events", payload),
    onSuccess: (event) => {
      invalidate(event);
      // The next step is adding tickets.
      navigate(`/seller/events/${event.id}/tickets`);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <div className="max-w-3xl">
      <Link to="/seller" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" />
        My events
      </Link>

      <h2 className="text-2xl font-extrabold text-fg">Create an event</h2>
      <p className="mt-1 mb-6 text-sm text-muted">
        It starts as a draft that only you can see. Add your tickets next, then publish it when you are ready.
      </p>

      <Card className="p-6 sm:p-8">
        <EventForm
          submitLabel="Create event and add tickets"
          busy={create.isPending}
          error={error}
          onSubmit={(payload) => {
            setError(null);
            create.mutate(payload);
          }}
        />
      </Card>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/seller/CreateEvent.tsx
// ==========================================