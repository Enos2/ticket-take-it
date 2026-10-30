// ==========================================
// FILE: frontend/src/components/seller/DuplicateEventButton.tsx
// PURPOSE: Copies an event and its tickets to new dates, as a new draft. For recurring events.
// ==========================================
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { api, errorMessage } from "../../lib/api";
import { inputToTime, isoToNairobiInput, nairobiInputToIso } from "../../lib/datetime";
import { useInvalidateEvent } from "../../lib/useInvalidateEvent";
import type { SellerEvent } from "../../lib/types";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import { Field } from "../ui/Field";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function DuplicateEventButton({ event }: { event: SellerEvent }) {
  const navigate = useNavigate();
  const invalidate = useInvalidateEvent();

  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);

  // A week later is the most common repeat, so the dates start there.
  function show() {
    setStart(isoToNairobiInput(new Date(new Date(event.startsAt).getTime() + WEEK_MS).toISOString()));
    setEnd(isoToNairobiInput(new Date(new Date(event.endsAt).getTime() + WEEK_MS).toISOString()));
    setError(null);
    setOpen(true);
  }

  const duplicate = useMutation({
    mutationFn: () =>
      api.post<SellerEvent>(`/events/${event.id}/duplicate`, {
        startsAt: nairobiInputToIso(start),
        endsAt: nairobiInputToIso(end),
      }),
    onSuccess: (copy) => {
      invalidate(copy);
      setOpen(false);
      navigate(`/seller/events/${copy.id}`);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function confirm() {
    if (!start || !end) return setError("Choose when the new event starts and ends.");
    if (inputToTime(start) <= Date.now()) return setError("The new start must be in the future.");
    if (inputToTime(end) <= inputToTime(start)) return setError("The end must be after the start.");
    setError(null);
    duplicate.mutate();
  }

  return (
    <>
      <Button size="sm" variant="secondary" icon={<Copy className="size-4" aria-hidden="true" />} onClick={show}>
        Duplicate
      </Button>

      <ConfirmDialog
        open={open}
        title="Duplicate this event?"
        confirmLabel="Create copy"
        cancelLabel="Cancel"
        loading={duplicate.isPending}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      >
        <p>You get a new draft with the same details and ticket types. Nothing sold is copied, and it goes through review like any new event.</p>
        <div className="space-y-4 pt-2">
          {error ? <Alert>{error}</Alert> : null}
          <Field label="New start (Nairobi time)" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          <Field label="New end (Nairobi time)" type="datetime-local" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </ConfirmDialog>
    </>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/seller/DuplicateEventButton.tsx
// ==========================================