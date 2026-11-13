// ==========================================
// FILE: frontend/src/pages/user/Transfers.tsx
// PURPOSE: Tickets other people sent to you (accept or decline), and tickets you sent that are still waiting.
// ==========================================
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { api, errorMessage } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { useTitle } from "../../lib/useTitle";
import type { TransferView, TransfersOverview } from "../../lib/transfers";

export default function Transfers() {
  useTitle("Transfers");

  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["transfers"],
    queryFn: () => api.get<TransfersOverview>("/transfers"),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["transfers"] });
    void queryClient.invalidateQueries({ queryKey: ["my-tickets"] });
  }

  const accept = useMutation({
    mutationFn: (transferId: string) => api.post(`/transfers/${transferId}/accept`),
    onSuccess: () => {
      refresh();
      setError(null);
      setNotice("The ticket is yours. You can find it, with its new QR code, under My tickets.");
    },
    onError: (err) => {
      refresh();
      setNotice(null);
      setError(errorMessage(err));
    },
  });

  const decline = useMutation({
    mutationFn: (transferId: string) => api.post(`/transfers/${transferId}/decline`),
    onSuccess: () => {
      refresh();
      setError(null);
      setNotice(null);
    },
    onError: (err) => {
      refresh();
      setError(errorMessage(err));
    },
  });

  const cancel = useMutation({
    mutationFn: (transferId: string) => api.post(`/transfers/${transferId}/cancel`),
    onSuccess: () => {
      refresh();
      setError(null);
      setNotice(null);
    },
    onError: (err) => {
      refresh();
      setError(errorMessage(err));
    },
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

  const { incoming, outgoing } = query.data;

  const eventLine = (t: TransferView) => (
    <>
      <h4 className="font-semibold text-fg">
        <Link to={`/events/${t.ticket.event.slug}`} className="hover:text-gold">
          {t.ticket.event.title}
        </Link>
      </h4>
      <p className="text-sm font-medium text-gold">{t.ticket.ticketType.name}</p>
      <p className="mt-1 text-sm text-muted">
        {formatDateTime(t.ticket.event.startsAt)} · {t.ticket.event.venue}, {t.ticket.event.city}
      </p>
    </>
  );

  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <div className="space-y-6">
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Alert variant="success">{notice}</Alert> : null}
        <EmptyState
          icon={<Send className="size-6" aria-hidden="true" />}
          title="No transfers waiting"
          text="When someone sends you a ticket, it shows up here. To send one of yours, open My tickets and press Transfer."
          action={
            <Link to="/account/tickets" className="font-semibold text-gold underline-offset-4 hover:underline">
              Go to My tickets
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}

      {incoming.length > 0 ? (
        <section>
          <h3 className="mb-3 text-sm font-semibold tracking-widest text-gold uppercase">Sent to you</h3>
          <ul className="space-y-3">
            {incoming.map((t) => (
              <li key={t.id}>
                <Card className="p-5">
                  <p className="mb-3 text-sm text-muted">
                    <span className="font-semibold text-fg">{t.from.fullName}</span> wants to send you a ticket.
                  </p>
                  {eventLine(t)}
                  {t.message ? <p className="mt-3 text-sm text-fg">"{t.message}"</p> : null}
                  <p className="mt-3 text-xs text-muted">Expires {formatDateTime(t.expiresAt)}</p>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <Button size="sm" loading={accept.isPending && accept.variables === t.id} onClick={() => accept.mutate(t.id)}>
                      Accept ticket
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={decline.isPending && decline.variables === t.id}
                      onClick={() => decline.mutate(t.id)}
                    >
                      Decline
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {outgoing.length > 0 ? (
        <section>
          <h3 className="mb-3 text-sm font-semibold tracking-widest text-gold uppercase">Waiting for an answer</h3>
          <ul className="space-y-3">
            {outgoing.map((t) => (
              <li key={t.id}>
                <Card className="flex flex-wrap items-start justify-between gap-4 p-5">
                  <div className="min-w-0">
                    {eventLine(t)}
                    <p className="mt-3 text-xs text-muted">
                      Sent to <span className="font-semibold text-fg">{t.toEmail}</span> · expires {formatDateTime(t.expiresAt)}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" loading={cancel.isPending && cancel.variables === t.id} onClick={() => cancel.mutate(t.id)}>
                    Cancel transfer
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/user/Transfers.tsx
// ==========================================