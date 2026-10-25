// ==========================================
// FILE: frontend/src/pages/seller/EventTickets.tsx
// PURPOSE: Add, edit, switch off and delete an event's ticket types.
// ==========================================
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Pencil, Plus, Ticket, Trash2 } from "lucide-react";
import TicketTypeForm from "../../components/seller/TicketTypeForm";
import Alert from "../../components/ui/Alert";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import EmptyState from "../../components/ui/EmptyState";
import { api, errorMessage } from "../../lib/api";
import { TIER_LABEL, saleState } from "../../lib/events";
import { formatDateTime, formatMoney } from "../../lib/format";
import { canEditEvent } from "../../lib/seller";
import type { TicketPayload } from "../../lib/seller";
import { useInvalidateEvent } from "../../lib/useInvalidateEvent";
import { useManagedEvent } from "../../lib/useManagedEvent";
import { useTitle } from "../../lib/useTitle";
import type { TicketType } from "../../lib/types";

export default function EventTickets() {
  const { event } = useManagedEvent();
  useTitle(`${event.title} · Tickets`);

  const invalidate = useInvalidateEvent();
  const editable = canEditEvent(event);

  // "new" shows the add form. A ticket shows the edit form for that ticket.
  const [editing, setEditing] = useState<"new" | TicketType | null>(null);
  const [deleting, setDeleting] = useState<TicketType | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  // One event sells in one currency. A new event starts in shillings.
  const currency = event.ticketTypes[0]?.currency ?? "KES";

  const save = useMutation({
    mutationFn: ({ id, payload }: { id: string | null; payload: TicketPayload }) =>
      id ? api.patch<TicketType>(`/events/${event.id}/tickets/${id}`, payload) : api.post<TicketType>(`/events/${event.id}/tickets`, payload),
    onSuccess: () => {
      invalidate(event);
      setEditing(null);
      setFormError(null);
    },
    onError: (err) => setFormError(errorMessage(err)),
  });

  const toggle = useMutation({
    mutationFn: (ticket: TicketType) => api.patch<TicketType>(`/events/${event.id}/tickets/${ticket.id}`, { isActive: !ticket.isActive }),
    onSuccess: () => {
      invalidate(event);
      setListError(null);
    },
    onError: (err) => setListError(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (ticket: TicketType) => api.delete(`/events/${event.id}/tickets/${ticket.id}`),
    onSuccess: () => {
      invalidate(event);
      setDeleting(null);
      setListError(null);
    },
    onError: (err) => {
      setDeleting(null);
      setListError(errorMessage(err));
    },
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-fg">Ticket types</h3>
          <p className="text-sm text-muted">What people can buy, and how many of each.</p>
        </div>
        {editable && editing === null ? (
          <Button
            icon={<Plus className="size-4" aria-hidden="true" />}
            onClick={() => {
              setFormError(null);
              setEditing("new");
            }}
          >
            Add ticket type
          </Button>
        ) : null}
      </div>

      {!editable ? (
        <div className="mb-6">
          <Alert variant="info">This event has ended or was cancelled, so its tickets can no longer be changed.</Alert>
        </div>
      ) : null}

      {listError ? (
        <div className="mb-6">
          <Alert>{listError}</Alert>
        </div>
      ) : null}

      {editing !== null ? (
        <div className="mb-6">
          <TicketTypeForm
            key={editing === "new" ? "new" : editing.id}
            ticket={editing === "new" ? null : editing}
            currency={currency}
            eventEndsAt={event.endsAt}
            busy={save.isPending}
            error={formError}
            onCancel={() => setEditing(null)}
            onSubmit={(payload) => {
              setFormError(null);
              save.mutate({ id: editing === "new" ? null : editing.id, payload });
            }}
          />
        </div>
      ) : null}

      {event.ticketTypes.length === 0 ? (
        editing === null ? (
          <EmptyState
            icon={<Ticket className="size-6" aria-hidden="true" />}
            title="No ticket types yet"
            text="Add at least one ticket type before you can publish the event."
            action={
              editable ? (
                <Button
                  icon={<Plus className="size-4" aria-hidden="true" />}
                  onClick={() => {
                    setFormError(null);
                    setEditing("new");
                  }}
                >
                  Add ticket type
                </Button>
              ) : undefined
            }
          />
        ) : null
      ) : (
        <ul className="space-y-3">
          {event.ticketTypes.map((ticket) => {
            const state = saleState(ticket);
            return (
              <li key={ticket.id}>
                <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold text-fg">{ticket.name}</h4>
                      <Badge tone={ticket.tier === "VIP" ? "gold" : "neutral"}>{TIER_LABEL[ticket.tier]}</Badge>
                      {!ticket.isActive ? <Badge tone="brand">Off sale</Badge> : null}
                    </div>

                    <p className="mt-1 text-sm text-muted tabular-nums">
                      {formatMoney(ticket.priceCents, ticket.currency)} · {ticket.sold} of {ticket.quantity} sold or held
                    </p>

                    <div className="mt-1 space-y-0.5 text-xs text-muted">
                      {ticket.tier === "EARLY_BIRD" && ticket.startsAt && ticket.endsAt ? (
                        <p>
                          Early bird window: {formatDateTime(ticket.startsAt)} to {formatDateTime(ticket.endsAt)}
                          {state === "ended" ? " (ended)" : state === "upcoming" ? " (not started)" : ""}
                        </p>
                      ) : null}
                      {ticket.isGroup && ticket.minGroupSize && ticket.maxGroupSize ? (
                        <p>
                          Groups of {ticket.minGroupSize} to {ticket.maxGroupSize}
                        </p>
                      ) : null}
                      {ticket.description ? <p>{ticket.description}</p> : null}
                    </div>
                  </div>

                  {editable ? (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Pencil className="size-4" aria-hidden="true" />}
                        onClick={() => {
                          setFormError(null);
                          setEditing(ticket);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={toggle.isPending && toggle.variables?.id === ticket.id}
                        onClick={() => toggle.mutate(ticket)}
                      >
                        {ticket.isActive ? "Take off sale" : "Put on sale"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 className="size-4" aria-hidden="true" />}
                        onClick={() => setDeleting(ticket)}
                        aria-label={`Delete ${ticket.name}`}
                      />
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "this ticket type"}?`}
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      >
        <p>It is removed for good. This only works for a ticket type nobody has ordered.</p>
        <p>If people already ordered it, take it off sale instead.</p>
      </ConfirmDialog>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/seller/EventTickets.tsx
// ==========================================