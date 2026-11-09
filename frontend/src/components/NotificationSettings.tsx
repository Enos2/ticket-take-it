// ==========================================
// FILE: frontend/src/components/NotificationSettings.tsx
// PURPOSE: Two email switches in Settings: event reminders and new events from organisers you follow.
// ==========================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Alert from "../components/ui/Alert";
import Card from "../components/ui/Card";
import { Spinner } from "../components/ui/Spinner";
import { api, errorMessage } from "../lib/api";
import type { NotificationPrefs } from "../lib/engagementTypes";

interface RowProps {
  title: string;
  text: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}

function Row({ title, text, checked, disabled, onChange }: RowProps) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-4 shrink-0 accent-brand"
      />
      <span>
        <span className="block text-sm font-semibold text-fg">{title}</span>
        <span className="block text-sm text-muted">{text}</span>
      </span>
    </label>
  );
}

export default function NotificationSettings() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const prefs = useQuery({
    queryKey: ["notification-prefs"],
    queryFn: () => api.get<NotificationPrefs>("/engagement/preferences"),
  });

  const save = useMutation({
    mutationFn: (patch: Partial<NotificationPrefs>) => api.patch<NotificationPrefs>("/engagement/preferences", patch),
    onSuccess: (data) => {
      setError(null);
      queryClient.setQueryData(["notification-prefs"], data);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <Card className="p-6">
      <h2 className="text-lg font-bold text-fg">Emails</h2>
      <p className="mt-1 text-sm text-muted">
        Order confirmations, refunds, cancellations and security emails are always sent, because you need them.
      </p>

      <div className="mt-5 space-y-5">
        {error ? <Alert>{error}</Alert> : null}

        {prefs.isPending ? (
          <Spinner />
        ) : prefs.isError ? (
          <Alert>{errorMessage(prefs.error)}</Alert>
        ) : (
          <>
            <Row
              title="Event reminders"
              text="One email about a day before an event you have tickets for."
              checked={prefs.data.notifyReminders}
              disabled={save.isPending}
              onChange={(value) => save.mutate({ notifyReminders: value })}
            />
            <Row
              title="New events from organisers I follow"
              text="One email when an organiser you follow puts a new event on sale."
              checked={prefs.data.notifyNewEvents}
              disabled={save.isPending}
              onChange={(value) => save.mutate({ notifyNewEvents: value })}
            />
          </>
        )}
      </div>
    </Card>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/NotificationSettings.tsx
// ==========================================