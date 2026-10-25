// ==========================================
// FILE: frontend/src/pages/admin/AdminEvents.tsx
// PURPOSE: Every event on the platform. Cancel an event, then refund everyone who paid.
// ==========================================
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import BulkRefundPanel from "../../components/admin/BulkRefundPanel";
import Alert from "../../components/ui/Alert";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Chips from "../../components/ui/Chips";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import EmptyState from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { api, errorMessage } from "../../lib/api";
import type { AdminEvent, CancelEventResult } from "../../lib/adminTypes";
import { formatDateTime } from "../../lib/format";
import { canEditEvent, displayStatus } from "../../lib/seller";
import { useAdminList } from "../../lib/useAdminList";
import { useTitle } from "../../lib/useTitle";
import type { EventStatus } from "../../lib/types";

type Filter = "" | EventStatus;

const FILTERS: { label: string; value: Filter }[] = [
  { label: "All", value: "" },
  { label: "Drafts", value: "DRAFT" },
  { label: "On sale", value: "PUBLISHED" },
  { label: "Cancelled", value: "CANCELLED" },
];

interface Target {
  id: string;
  title: string;
}

export default function AdminEvents() {
  useTitle("Events");
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<Filter>("");
  const [cancelling, setCancelling] = useState<Target | null>(null);
  const [refundConfirm, setRefundConfirm] = useState<Target | null>(null);
  const [refunding, setRefunding] = useState<Target | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; event: Target; canRefund: boolean } | null>(null);

  const { query, items, total } = useAdminList<AdminEvent>("admin-events", "/admin/events", { status: filter });

  const cancel = useMutation({
    mutationFn: (event: Target) => api.post<CancelEventResult>(`/events/${event.id}/cancel`),
    onSuccess: (result, event) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-events"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["events"] }); // the public lists
      setCancelling(null);
      setError(null);
      setNotice({
        event,
        canRefund: result.paidOrdersToRefund > 0,
        text:
          result.paidOrdersToRefund > 0
            ? `${event.title} is cancelled and ticket holders were emailed. ${result.paidOrdersToRefund} paid ${
                result.paidOrdersToRefund === 1 ? "order is" : "orders are"
              } waiting for a refund.`
            : `${event.title} is cancelled. Nobody had paid, so there is nothing to refund.`,
      });
    },
    onError: (err) => {
      setCancelling(null);
      setNotice(null);
      setError(errorMessage(err));
    },
  });

  return (
    <div>
      <div className="mb-6">
        <Chips label="Filter events" options={FILTERS} value={filter} onChange={setFilter} />
      </div>

      <div className="mb-6 space-y-3 empty:hidden">
        {error ? <Alert>{error}</Alert> : null}
        {notice ? (
          <Alert variant="success">
            <p>{notice.text}</p>
            {notice.canRefund ? (
              <Button
                size="sm"
                className="mt-3"
                onClick={() => {
                  setRefundConfirm(notice.event);
                  setNotice(null);
                }}
              >
                Refund these orders now
              </Button>
            ) : null}
          </Alert>
        ) : null}
      </div>

      {refunding ? <BulkRefundPanel key={refunding.id} event={refunding} onClose={() => setRefunding(null)} /> : null}

      {query.isPending ? (
        <PageSpinner />
      ) : query.isError ? (
        <div className="space-y-4">
          <Alert>{errorMessage(query.error)}</Alert>
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<CalendarDays className="size-6" aria-hidden="true" />} title="No events here" />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">
            {total} {total === 1 ? "event" : "events"}
          </p>

          <ul className="space-y-3">
            {items.map((event) => {
              const status = displayStatus(event);
              const capacity = event.ticketTypes.reduce((sum, t) => sum + t.quantity, 0);
              const taken = event.ticketTypes.reduce((sum, t) => sum + t.sold, 0);
              const live = event.status === "PUBLISHED" || event.status === "SOLD_OUT";

              return (
                <li key={event.id}>
                  <Card className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-semibold text-fg">
                          {live ? (
                            <Link to={`/events/${event.slug}`} className="hover:text-gold">
                              {event.title}
                            </Link>
                          ) : (
                            event.title
                          )}
                        </h2>
                        <Badge tone={status.tone}>{status.label}</Badge>
                        {event.seller.status !== "APPROVED" ? <Badge tone="brand">Seller {event.seller.status.toLowerCase()}</Badge> : null}
                      </div>

                      <p className="mt-1 text-sm text-muted">
                        By {event.seller.businessName} · {formatDateTime(event.startsAt)} · {event.venue}, {event.city}
                      </p>
                      <p className="mt-0.5 text-xs text-muted tabular-nums">
                        {taken} of {capacity} tickets sold or held
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      {canEditEvent(event) ? (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            setNotice(null);
                            setError(null);
                            setCancelling({ id: event.id, title: event.title });
                          }}
                        >
                          Cancel event
                        </Button>
                      ) : null}
                      {event.status === "CANCELLED" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={refunding !== null}
                          onClick={() => setRefundConfirm({ id: event.id, title: event.title })}
                        >
                          Refund orders
                        </Button>
                      ) : null}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>

          {query.hasNextPage ? (
            <div className="mt-8 flex justify-center">
              <Button variant="secondary" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                Load more
              </Button>
            </div>
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={cancelling !== null}
        title={`Cancel ${cancelling?.title ?? "this event"}?`}
        confirmLabel="Cancel the event"
        cancelLabel="Keep the event"
        danger
        loading={cancel.isPending}
        onConfirm={() => cancelling && cancel.mutate(cancelling)}
        onCancel={() => setCancelling(null)}
      >
        <p>Ticket sales stop straight away and every issued ticket stops working. This cannot be undone.</p>
        <p>People who already paid are emailed, and they are owed a refund. You can start those refunds right after.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={refundConfirm !== null}
        title={`Refund every paid order for ${refundConfirm?.title ?? "this event"}?`}
        confirmLabel="Start refunds"
        danger
        onConfirm={() => {
          setRefunding(refundConfirm);
          setRefundConfirm(null);
        }}
        onCancel={() => setRefundConfirm(null)}
      >
        <p>Each order is refunded and its tickets cancelled. Customers are emailed.</p>
        <p>Paystack payments are returned automatically. M-Pesa payments go to the Refunds tab to be returned by hand.</p>
      </ConfirmDialog>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/admin/AdminEvents.tsx
// ==========================================