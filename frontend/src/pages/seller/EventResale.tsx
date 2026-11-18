// ==========================================
// FILE: frontend/src/pages/seller/EventResale.tsx
// PURPOSE: Let the organiser decide whether fans can resell tickets for this event, and the highest price allowed.
// ==========================================
import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import { Field } from "../../components/ui/Field";
import { PageSpinner } from "../../components/ui/Spinner";
import { api, errorMessage } from "../../lib/api";
import { canEditEvent } from "../../lib/seller";
import { useManagedEvent } from "../../lib/useManagedEvent";
import { useTitle } from "../../lib/useTitle";
import type { ResaleSettings, ResaleSettingsPayload } from "../../lib/resale";

interface FormProps {
  eventId: string;
  settings: ResaleSettings;
  editable: boolean;
}

function SettingsForm({ eventId, settings, editable }: FormProps) {
  const queryClient = useQueryClient();

  const [enabled, setEnabled] = useState(settings.enabled);
  const [percent, setPercent] = useState(String(settings.maxPercent));
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (payload: ResaleSettingsPayload) => api.put<ResaleSettings>(`/resale/events/${eventId}/settings`, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["seller-resale", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["resale", eventId] });
      setError(null);
      setSaved(true);
    },
    onError: (err) => {
      setSaved(false);
      setError(errorMessage(err));
    },
  });

  const percentNumber = /^\d+$/.test(percent.trim()) ? Number(percent.trim()) : NaN;
  const percentError = Number.isInteger(percentNumber) && percentNumber >= 1 && percentNumber <= 200 ? undefined : "Enter a number from 1 to 200";
  const dirty = enabled !== settings.enabled || percentNumber !== settings.maxPercent;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (percentError) {
      setShowErrors(true);
      return;
    }
    setSaved(false);
    setError(null);
    save.mutate({ enabled, maxPercent: percentNumber });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {error ? <Alert>{error}</Alert> : null}
      {saved ? <Alert variant="success">Your resale settings are saved.</Alert> : null}

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-4"
          checked={enabled}
          disabled={!editable}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span>
          <span className="block font-semibold text-fg">Allow fans to resell their tickets</span>
          <span className="block text-sm text-muted">
            Buyers who can't come can sell their ticket to another fan on Ticket Take It, instead of on the street.
          </span>
        </span>
      </label>

      <Field
        label="Highest resale price (% of the original price)"
        inputMode="numeric"
        value={percent}
        onChange={(e) => setPercent(e.target.value)}
        error={showErrors ? percentError : undefined}
        disabled={!editable || !enabled}
        hint="100 means a ticket can be resold at most for what it cost. Use more to allow a small mark-up, or less to force a discount."
      />

      <Button type="submit" loading={save.isPending} disabled={!editable || !dirty}>
        Save settings
      </Button>
    </form>
  );
}

export default function EventResale() {
  const { event } = useManagedEvent();
  useTitle(`${event.title} · Resale`);

  const editable = canEditEvent(event);

  const query = useQuery({
    queryKey: ["seller-resale", event.id],
    queryFn: () => api.get<ResaleSettings>(`/resale/events/${event.id}/settings`),
  });

  if (query.isPending) return <PageSpinner />;

  if (query.isError) {
    return (
      <div className="space-y-4">
        <Alert>{errorMessage(query.error)}</Alert>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const settings = query.data;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h3 className="text-lg font-bold text-fg">Ticket resale</h3>
        <p className="text-sm text-muted">
          You stay in control. Resale only happens if you switch it on, and the price can never go above the limit you set.
        </p>
      </div>

      {!editable ? <Alert variant="info">This event has ended or was cancelled, so resale settings can no longer be changed.</Alert> : null}

      <Card className="p-6">
        {/* The key restarts the form with the saved values after each save. */}
        <SettingsForm key={`${settings.enabled}-${settings.maxPercent}`} eventId={event.id} settings={settings} editable={editable} />
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <p className="text-sm text-muted">For sale right now</p>
          <p className="mt-1 text-2xl font-extrabold text-fg tabular-nums">{settings.open}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted">Resold so far</p>
          <p className="mt-1 text-2xl font-extrabold text-fg tabular-nums">{settings.sold}</p>
        </Card>
      </div>

      <section className="space-y-2 text-sm text-muted">
        <h4 className="text-sm font-semibold tracking-widest text-gold uppercase">How it works</h4>
        <ul className="list-disc space-y-1 pl-5">
          <li>Free and complimentary tickets can't be resold.</li>
          <li>The price limit is always a share of what the ticket first cost, however many times it changes hands.</li>
          <li>When a resold ticket is paid for, it gets a new QR code, so the seller's old code stops working.</li>
          <li>The money for a resale goes to the seller, not to you. Your own sales and earnings are not affected.</li>
        </ul>
      </section>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/seller/EventResale.tsx
// ==========================================