// ==========================================
// FILE: frontend/src/pages/seller/EventManage.tsx
// PURPOSE: One event's management screen: header, review actions and tabs. The tabs render inside it.
// ==========================================
import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarX2, ExternalLink, Send, Trash2 } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import DuplicateEventButton from "../../components/seller/DuplicateEventButton";
import EmptyState from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { buttonClasses } from "../../components/ui/styles";
import { ApiRequestError, api, errorMessage } from "../../lib/api";
import { cx } from "../../lib/cx";
import { formatDateTime } from "../../lib/format";
import { displayStatus } from "../../lib/seller";
import { useInvalidateEvent } from "../../lib/useInvalidateEvent";
import { useTitle } from "../../lib/useTitle";
import type { SellerEvent } from "../../lib/types";

type Confirm = "unpublish" | "cancel" | "delete" | null;

interface CancelResult {
  event: SellerEvent;
  paidOrdersToRefund: number;
}

const tabClass = ({ isActive }: { isActive: boolean }) =>
  cx(
    "-mb-px shrink-0 border-b-2 px-1 pb-3 text-sm font-semibold transition-colors",
    isActive ? "border-gold text-gold" : "border-transparent text-muted hover:text-fg"
  );

export default function EventManage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const invalidate = useInvalidateEvent();

  const [confirm, setConfirm] = useState<Confirm>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["seller-event", eventId],
    queryFn: () => api.get<SellerEvent>(`/sellers/events/${eventId}`),
    enabled: Boolean(eventId),
  });

  const event = query.data;
  useTitle(event?.title);

  function fail(err: unknown) {
    setConfirm(null);
    setNotice(null);
    setActionError(errorMessage(err));
  }

  // Sellers send events for review. An admin then approves them, or sends them back with a reason.
  const submit = useMutation({
    mutationFn: () => api.post<SellerEvent>(`/events/${eventId}/submit`),
    onSuccess: (updated) => {
      invalidate(updated);
      setActionError(null);
      setNotice(
        updated.status === "PUBLISHED"
          ? "Your event is live. People can now find it and buy tickets."
          : "Sent for review. You will see the decision on this page."
      );
    },
    onError: fail,
  });

  const withdraw = useMutation({
    mutationFn: () => api.post<SellerEvent>(`/events/${eventId}/withdraw`),
    onSuccess: (updated) => {
      invalidate(updated);
      setActionError(null);
      setNotice("Taken back out of review. It is a draft again, so you can edit it.");
    },
    onError: fail,
  });

  const unpublish = useMutation({
    mutationFn: () => api.post<SellerEvent>(`/events/${eventId}/unpublish`),
    onSuccess: (updated) => {
      invalidate(updated);
      setConfirm(null);
      setActionError(null);
      setNotice("The event is back to a draft and hidden from the public. It needs approval again before it goes live.");
    },
    onError: fail,
  });

  const cancel = useMutation({
    mutationFn: () => api.post<CancelResult>(`/events/${eventId}/cancel`),
    onSuccess: (result) => {
      invalidate(result.event);
      setConfirm(null);
      setActionError(null);
      setNotice(
        result.paidOrdersToRefund > 0
          ? `The event is cancelled and ticket holders were emailed. ${result.paidOrdersToRefund} paid ${
              result.paidOrdersToRefund === 1 ? "order needs" : "orders need"
            } a refund. The Ticket Take It team will process them.`
          : "The event is cancelled. Nobody had paid yet, so there is nothing to refund."
      );
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/events/${eventId}`),
    onSuccess: () => {
      if (event) invalidate(event);
      navigate("/seller", { replace: true });
    },
    onError: fail,
  });

  if (query.isPending) return <PageSpinner />;

  if (query.isError || !event) {
    const status = query.error instanceof ApiRequestError ? query.error.status : 0;
    return status === 403 || status === 404 ? (
      <EmptyState
        icon={<CalendarX2 className="size-6" aria-hidden="true" />}
        title="Event not found"
        text="It doesn't exist, or it belongs to another seller."
        action={
          <Link to="/seller" className={buttonClasses("secondary")}>
            My events
          </Link>
        }
      />
    ) : (
      <Alert>{errorMessage(query.error)}</Alert>
    );
  }

  const status = displayStatus(event);
  const activeTickets = event.ticketTypes.filter((t) => t.isActive).length;
  const isLive = event.status === "PUBLISHED" || event.status === "SOLD_OUT";
  const canSubmit = event.status === "DRAFT" || event.status === "REJECTED";
  const canDelete = event.status === "DRAFT" || event.status === "REJECTED";

  return (
    <div>
      <Link to="/seller" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" />
        My events
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-extrabold text-fg">{event.title}</h2>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">
            {formatDateTime(event.startsAt)} · {event.venue}, {event.city}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {isLive ? (
            <Link to={`/events/${event.slug}`} className={buttonClasses("secondary", "sm")}>
              <ExternalLink className="size-4" aria-hidden="true" />
              View public page
            </Link>
          ) : null}

          {canSubmit ? (
            <Button size="sm" icon={<Send className="size-4" aria-hidden="true" />} loading={submit.isPending} onClick={() => submit.mutate()}>
              Submit for review
            </Button>
          ) : null}

          {event.status === "PENDING_REVIEW" ? (
            <Button size="sm" variant="secondary" loading={withdraw.isPending} onClick={() => withdraw.mutate()}>
              Withdraw from review
            </Button>
          ) : null}

          <DuplicateEventButton event={event} />
          {canDelete ? (
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden="true" />} onClick={() => setConfirm("delete")}>
              Delete
            </Button>
          ) : null}

          {isLive ? (
            <Button size="sm" variant="secondary" onClick={() => setConfirm("unpublish")}>
              Unpublish
            </Button>
          ) : null}

          {isLive || event.status === "TAKEN_DOWN" ? (
            <Button size="sm" variant="danger" onClick={() => setConfirm("cancel")}>
              Cancel event
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-6 space-y-3 empty:hidden">
        {actionError ? <Alert>{actionError}</Alert> : null}
        {notice ? <Alert variant="success">{notice}</Alert> : null}

        {event.status === "DRAFT" && !notice ? (
          <Alert variant="info">
            {activeTickets === 0
              ? "This event is a draft. Add at least one ticket type, then submit it for review."
              : "This event is a draft and nobody can see it yet. Submit it for review when you are ready. Once an admin approves it, it goes live."}
          </Alert>
        ) : null}

        {event.status === "PENDING_REVIEW" ? (
          <Alert variant="info">
            Waiting for review. Nobody can see this event yet. You can't edit it until it is approved, or you withdraw it from review.
          </Alert>
        ) : null}

        {event.status === "REJECTED" ? (
          <Alert>
            <p className="font-semibold">This event was not approved.</p>
            {event.reviewNote ? <p className="mt-1">Reason: {event.reviewNote}</p> : null}
            <p className="mt-1">Fix the problem, then submit it for review again.</p>
          </Alert>
        ) : null}

        {event.status === "TAKEN_DOWN" ? (
          <Alert>
            <p className="font-semibold">This event was taken down by the Ticket Take It team.</p>
            {event.reviewNote ? <p className="mt-1">Reason: {event.reviewNote}</p> : null}
            <p className="mt-1">
              Ticket sales are paused and the event is hidden. Tickets already sold still work. Contact us to have it restored.
            </p>
          </Alert>
        ) : null}

        {event.status === "CANCELLED" && !notice ? <Alert variant="info">This event was cancelled.</Alert> : null}
      </div>

      <nav className="mt-8 mb-8 flex gap-6 overflow-x-auto border-b border-line" aria-label="Event sections">
        <NavLink to={`/seller/events/${event.id}`} end className={tabClass}>
          Overview
        </NavLink>
        <NavLink to={`/seller/events/${event.id}/tickets`} className={tabClass}>
          Tickets
        </NavLink>
        <NavLink to={`/seller/events/${event.id}/details`} className={tabClass}>
          Details
        </NavLink>
        <NavLink to={`/seller/events/${event.id}/attendees`} className={tabClass}>
          Attendees
        </NavLink>
      </nav>

      <Outlet context={{ event }} />

      <ConfirmDialog
        open={confirm === "unpublish"}
        title="Unpublish this event?"
        confirmLabel="Unpublish"
        loading={unpublish.isPending}
        onConfirm={() => unpublish.mutate()}
        onCancel={() => setConfirm(null)}
      >
        <p>The event disappears from the public site and nobody can buy tickets.</p>
        <p>It goes back to a draft, and needs approval again before it is live. This is only possible while no tickets have been sold.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === "cancel"}
        title="Cancel this event?"
        confirmLabel="Cancel the event"
        cancelLabel="Keep the event"
        danger
        loading={cancel.isPending}
        onConfirm={() => cancel.mutate()}
        onCancel={() => setConfirm(null)}
      >
        <p>Ticket sales stop straight away and every issued ticket stops working. This cannot be undone.</p>
        <p>People who already paid are emailed, and they are owed a refund.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === "delete"}
        title="Delete this event?"
        confirmLabel="Delete forever"
        danger
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirm(null)}
      >
        <p>The event and its ticket types are removed for good. This cannot be undone.</p>
      </ConfirmDialog>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/seller/EventManage.tsx
// ==========================================