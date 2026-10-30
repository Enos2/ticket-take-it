// ==========================================
// FILE: frontend/src/pages/admin/AdminEvents.tsx
// PURPOSE: Review queue and control of every event: approve, reject, take down, restore, cancel and refund.
// ==========================================
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronDown } from "lucide-react";
import BulkRefundPanel from "../../components/admin/BulkRefundPanel";
import Alert from "../../components/ui/Alert";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Chips from "../../components/ui/Chips";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import EmptyState from "../../components/ui/EmptyState";
import { TextAreaField } from "../../components/ui/Field";
import { PageSpinner } from "../../components/ui/Spinner";
import { api, errorMessage } from "../../lib/api";
import type { AdminEvent, CancelEventResult } from "../../lib/adminTypes";
import { cx } from "../../lib/cx";
import { TIER_LABEL } from "../../lib/events";
import { formatDateTime, formatMoney } from "../../lib/format";
import { displayStatus } from "../../lib/seller";
import { useAdminList } from "../../lib/useAdminList";
import { useTitle } from "../../lib/useTitle";
import type { EventStatus } from "../../lib/types";

type Filter = "" | EventStatus;
type Action = "approve" | "reject" | "takedown" | "restore";

const FILTERS: { label: string; value: Filter }[] = [
  { label: "Needs review", value: "PENDING_REVIEW" },
  { label: "On sale", value: "PUBLISHED" },
  { label: "Taken down", value: "TAKEN_DOWN" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Drafts", value: "DRAFT" },
  { label: "Cancelled", value: "CANCELLED" },
  { label: "All", value: "" },
];

interface Target {
  id: string;
  title: string;
}

interface RowProps {
  event: AdminEvent;
  busy: boolean;
  refunding: boolean;
  onApprove: () => void;
  onReject: () => void;
  onTakedown: () => void;
  onRestore: () => void;
  onCancel: () => void;
  onRefund: () => void;
}

function EventRow({ event, busy, refunding, onApprove, onReject, onTakedown, onRestore, onCancel, onRefund }: RowProps) {
  const [open, setOpen] = useState(event.status === "PENDING_REVIEW");

  const status = displayStatus(event);
  const capacity = event.ticketTypes.reduce((sum, t) => sum + t.quantity, 0);
  const taken = event.ticketTypes.reduce((sum, t) => sum + t.sold, 0);
  const live = event.status === "PUBLISHED" || event.status === "SOLD_OUT";

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-fg">
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
            {event.submittedAt ? ` · submitted ${formatDateTime(event.submittedAt)}` : ""}
          </p>

          {event.reviewNote && (event.status === "REJECTED" || event.status === "TAKEN_DOWN") ? (
            <p className="mt-2 text-sm text-muted">
              <span className="font-semibold text-fg">{event.status === "REJECTED" ? "Rejected" : "Taken down"}:</span> {event.reviewNote}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {event.status === "PENDING_REVIEW" ? (
            <>
              <Button size="sm" disabled={busy} onClick={onApprove}>
                Approve
              </Button>
              <Button size="sm" variant="danger" disabled={busy} onClick={onReject}>
                Reject
              </Button>
            </>
          ) : null}
          {live ? (
            <>
              <Button size="sm" variant="secondary" disabled={busy} onClick={onTakedown}>
                Take down
              </Button>
              <Button size="sm" variant="danger" disabled={busy} onClick={onCancel}>
                Cancel event
              </Button>
            </>
          ) : null}
          {event.status === "TAKEN_DOWN" ? (
            <>
              <Button size="sm" disabled={busy} onClick={onRestore}>
                Restore
              </Button>
              <Button size="sm" variant="danger" disabled={busy} onClick={onCancel}>
                Cancel event
              </Button>
            </>
          ) : null}
          {event.status === "CANCELLED" ? (
            <Button size="sm" variant="secondary" disabled={refunding} onClick={onRefund}>
              Refund orders
            </Button>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-gold underline-offset-4 hover:underline"
      >
        {open ? "Hide details" : "Show details"}
        <ChevronDown className={cx("size-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      {open ? (
        <div className="mt-4 grid gap-6 border-t border-line pt-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold tracking-widest text-gold uppercase">Description</h3>
            <p className="text-sm leading-relaxed whitespace-pre-line text-muted">{event.description}</p>
            <p className="mt-3 text-sm text-muted">
              {formatDateTime(event.startsAt)} to {formatDateTime(event.endsAt)}
              <br />
              {event.venue}, {event.city}, {event.country}
            </p>
            {event.bannerUrl ? (
              <img src={event.bannerUrl} alt="" loading="lazy" className="mt-3 max-h-40 rounded-lg border border-line object-cover" />
            ) : null}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold tracking-widest text-gold uppercase">Ticket types</h3>
            {event.ticketTypes.length === 0 ? (
              <p className="text-sm text-muted">No ticket types.</p>
            ) : (
              <ul className="space-y-2">
                {event.ticketTypes.map((t, i) => (
                  <li key={`${t.name}-${i}`} className="flex items-start justify-between gap-3 rounded-lg border border-line bg-ink px-3 py-2 text-sm">
                    <span className="text-fg">
                      {t.name} <span className="text-xs text-muted">{TIER_LABEL[t.tier]}</span>
                      {!t.isActive ? <span className="ml-2 text-xs text-brand">off sale</span> : null}
                    </span>
                    <span className="shrink-0 text-right text-muted tabular-nums">
                      {formatMoney(t.priceCents, t.currency)}
                      <span className="block text-xs">{t.quantity} tickets</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

export default function AdminEvents() {
  useTitle("Events");
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<Filter>("PENDING_REVIEW");
  const [dialog, setDialog] = useState<{ kind: "reject" | "takedown"; event: Target } | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Target | null>(null);
  const [refundConfirm, setRefundConfirm] = useState<Target | null>(null);
  const [refunding, setRefunding] = useState<Target | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; event?: Target; canRefund?: boolean } | null>(null);

  const { query, items, total } = useAdminList<AdminEvent>("admin-events", "/admin/events", { status: filter });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["admin-events"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    void queryClient.invalidateQueries({ queryKey: ["events"] }); // the public lists
  }

  const moderate = useMutation({
    mutationFn: ({ event, action, why }: { event: Target; action: Action; why?: string }) =>
      api.post(`/admin/events/${event.id}/${action}`, why ? { reason: why } : {}),
    onSuccess: (_data, { event, action }) => {
      refresh();
      setDialog(null);
      setReason("");
      setReasonError(null);
      setError(null);
      setNotice({
        text:
          action === "approve"
            ? `${event.title} is approved and live.`
            : action === "reject"
              ? `${event.title} was sent back to the seller. They can see your reason on the event page.`
              : action === "takedown"
                ? `${event.title} is taken down. Sales are paused and it is hidden. Tickets already sold still work.`
                : `${event.title} is live again.`,
      });
    },
    onError: (err) => {
      setDialog(null);
      setNotice(null);
      setError(errorMessage(err));
    },
  });

  const cancel = useMutation({
    mutationFn: (event: Target) => api.post<CancelEventResult>(`/events/${event.id}/cancel`),
    onSuccess: (result, event) => {
      refresh();
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

  function startDialog(kind: "reject" | "takedown", event: AdminEvent) {
    setNotice(null);
    setError(null);
    setReason("");
    setReasonError(null);
    setDialog({ kind, event: { id: event.id, title: event.title } });
  }

  function confirmReason() {
    if (!dialog) return;
    const text = reason.trim();
    if (text.length < 5) {
      setReasonError("Please give a reason of at least 5 characters.");
      return;
    }
    moderate.mutate({ event: dialog.event, action: dialog.kind, why: text });
  }

  function direct(action: "approve" | "restore", event: AdminEvent) {
    setNotice(null);
    setError(null);
    moderate.mutate({ event: { id: event.id, title: event.title }, action });
  }

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
            {notice.canRefund && notice.event ? (
              <Button
                size="sm"
                className="mt-3"
                onClick={() => {
                  setRefundConfirm(notice.event ?? null);
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
        <EmptyState
          icon={<CalendarDays className="size-6" aria-hidden="true" />}
          title={filter === "PENDING_REVIEW" ? "Nothing waiting for review" : "No events here"}
          text={filter === "PENDING_REVIEW" ? "Events that sellers submit appear here. Choose All to see every event." : undefined}
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">
            {total} {total === 1 ? "event" : "events"}
          </p>

          <ul className="space-y-3">
            {items.map((event) => (
              <li key={event.id}>
                <EventRow
                  event={event}
                  busy={moderate.isPending || cancel.isPending}
                  refunding={refunding !== null}
                  onApprove={() => direct("approve", event)}
                  onReject={() => startDialog("reject", event)}
                  onTakedown={() => startDialog("takedown", event)}
                  onRestore={() => direct("restore", event)}
                  onCancel={() => {
                    setNotice(null);
                    setError(null);
                    setCancelling({ id: event.id, title: event.title });
                  }}
                  onRefund={() => setRefundConfirm({ id: event.id, title: event.title })}
                />
              </li>
            ))}
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
        open={dialog !== null}
        title={dialog?.kind === "reject" ? `Reject ${dialog.event.title}?` : `Take down ${dialog?.event.title ?? "this event"}?`}
        confirmLabel={dialog?.kind === "reject" ? "Reject event" : "Take down"}
        danger
        loading={moderate.isPending}
        onConfirm={confirmReason}
        onCancel={() => setDialog(null)}
      >
        {dialog?.kind === "reject" ? (
          <p>The seller sees your reason on the event page, can fix the problem and submit it again.</p>
        ) : (
          <>
            <p>Sales stop and the event disappears from the public site. Orders and tickets already sold are not touched.</p>
            <p>You can restore it later, or cancel it and refund everyone.</p>
          </>
        )}
        <div className="pt-2">
          <TextAreaField
            label="Reason (the seller will read this)"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setReasonError(null);
            }}
            error={reasonError ?? undefined}
          />
        </div>
      </ConfirmDialog>

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