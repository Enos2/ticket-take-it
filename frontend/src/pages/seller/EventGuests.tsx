// ==========================================
// FILE: frontend/src/pages/seller/EventGuests.tsx
// PURPOSE: Give out the tickets kept back for guests, see who has them, and take unused ones back.
// ==========================================
import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import EmptyState from "../../components/ui/EmptyState";
import { Field, SelectField } from "../../components/ui/Field";
import { PageSpinner } from "../../components/ui/Spinner";
import { api, errorMessage } from "../../lib/api";
import { TIER_LABEL } from "../../lib/events";
import { formatDateTime } from "../../lib/format";
import { canGiveOutTickets } from "../../lib/seller";
import { useInvalidateEvent } from "../../lib/useInvalidateEvent";
import { useManagedEvent } from "../../lib/useManagedEvent";
import { useTitle } from "../../lib/useTitle";
import type { CompsOverview, IssueCompPayload, IssuedComp } from "../../lib/comps";
import type { TicketStatus } from "../../lib/types";

const TICKET_LABEL: Record<TicketStatus, string> = {
  VALID: "Not yet arrived",
  USED: "Checked in",
  VOID: "Taken back",
};

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export default function EventGuests() {
  const { event } = useManagedEvent();
  useTitle(`${event.title} · Guests`);

  const invalidate = useInvalidateEvent();
  const open = canGiveOutTickets(event);

  const [typeId, setTypeId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<{ ticketId: string; guest: string } | null>(null);

  const query = useQuery({
    queryKey: ["seller-comps", event.id],
    queryFn: () => api.get<CompsOverview>(`/events/${event.id}/comps`),
  });

  const give = useMutation({
    mutationFn: (payload: IssueCompPayload) => api.post<IssuedComp>(`/events/${event.id}/comps`, payload),
    onSuccess: (result) => {
      invalidate(event);
      setFormError(null);
      setShowErrors(false);
      setNotice(`${result.quantity} ${result.ticketType} ticket(s) were given to ${result.recipient.email}. They can find them under My tickets.`);
      setEmail("");
      setNote("");
      setQuantity("1");
    },
    onError: (err) => {
      setNotice(null);
      setFormError(errorMessage(err));
    },
  });

  const revoke = useMutation({
    mutationFn: (ticketId: string) => api.delete(`/events/${event.id}/comps/${ticketId}`),
    onSuccess: () => {
      invalidate(event);
      setRevoking(null);
      setListError(null);
    },
    onError: (err) => {
      setRevoking(null);
      setListError(errorMessage(err));
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

  const { reservations, comps } = query.data;
  const options = reservations.filter((r) => r.remaining > 0);
  const selected = reservations.find((r) => r.ticketTypeId === (typeId || options[0]?.ticketTypeId));

  // ---- validation ----
  const qty = /^\d+$/.test(quantity) ? Number(quantity) : NaN;
  const errors: { quantity?: string; email?: string } = {};
  if (!selected) {
    // nothing to validate until a ticket type is chosen
  } else if (!Number.isInteger(qty) || qty < 1) errors.quantity = "Enter how many tickets to give";
  else if (qty > selected.remaining) errors.quantity = `Only ${selected.remaining} are kept for guests`;
  if (!EMAIL_PATTERN.test(email.trim())) errors.email = "Enter the guest's email address";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selected || Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    setFormError(null);
    setNotice(null);
    give.mutate({
      ticketTypeId: selected.ticketTypeId,
      quantity: qty,
      recipientEmail: email.trim().toLowerCase(),
      note: note.trim() || undefined,
    });
  }

  const totalKept = reservations.reduce((sum, r) => sum + r.reserved, 0);

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-bold text-fg">Guests</h3>
        <p className="text-sm text-muted">
          Keep tickets off public sale and give them to guests, sponsors or artists. They count towards your event capacity and work at the door like any other
          ticket.
        </p>
      </div>

      {/* what is kept back */}
      <section>
        <h3 className="mb-3 text-sm font-semibold tracking-widest text-gold uppercase">Kept for guests</h3>
        {reservations.length === 0 ? (
          <Card className="p-6 text-sm text-muted">Add ticket types first, on the Tickets tab.</Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-120 text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs tracking-wide text-muted uppercase">
                  <th className="px-5 py-3 font-semibold">Ticket</th>
                  <th className="px-5 py-3 text-right font-semibold">Kept</th>
                  <th className="px-5 py-3 text-right font-semibold">Given out</th>
                  <th className="px-5 py-3 text-right font-semibold">Still kept</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((r) => (
                  <tr key={r.ticketTypeId} className="border-b border-line last:border-0">
                    <td className="px-5 py-3">
                      <span className="font-medium text-fg">{r.name}</span>
                      <span className="ml-2 text-xs text-muted">{TIER_LABEL[r.tier]}</span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted">{r.reserved}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted">{r.givenOut}</td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums text-fg">{r.remaining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        <p className="mt-3 text-xs text-muted">
          To keep more (or fewer) tickets for guests, edit the ticket type on the{" "}
          <Link to={`/seller/events/${event.id}/tickets`} className="font-semibold text-gold underline-offset-4 hover:underline">
            Tickets tab
          </Link>
          .
        </p>
      </section>

      {/* give tickets */}
      <section>
        <h3 className="mb-3 text-sm font-semibold tracking-widest text-gold uppercase">Give tickets to a guest</h3>

        {!open ? (
          <Alert variant="info">Tickets can only be given out while the event is on sale.</Alert>
        ) : options.length === 0 ? (
          <Alert variant="info">
            {totalKept === 0
              ? "No tickets are kept for guests yet. Edit a ticket type on the Tickets tab and set how many to keep for guests."
              : "Every ticket kept for guests has been given out. Keep more on the Tickets tab, or take a ticket back below."}
          </Alert>
        ) : (
          <Card className="p-6">
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {formError ? <Alert>{formError}</Alert> : null}
              {notice ? <Alert variant="success">{notice}</Alert> : null}

              <div className="grid gap-5 sm:grid-cols-2">
                <SelectField label="Ticket" value={selected?.ticketTypeId ?? ""} onChange={(e) => setTypeId(e.target.value)}>
                  {options.map((r) => (
                    <option key={r.ticketTypeId} value={r.ticketTypeId}>
                      {r.name} ({r.remaining} kept)
                    </option>
                  ))}
                </SelectField>
                <Field
                  label="How many"
                  inputMode="numeric"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  error={showErrors ? errors.quantity : undefined}
                />
              </div>

              <Field
                label="Guest's email"
                type="email"
                placeholder="guest@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={showErrors ? errors.email : undefined}
                hint="Your guest needs a Ticket Take It account with this email. The tickets appear in their account straight away."
              />

              <Field
                label="Note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                hint="Only you can see this, for example Sponsor or Artist's family."
              />

              <Button type="submit" loading={give.isPending}>
                Give tickets
              </Button>
            </form>
          </Card>
        )}
      </section>

      {/* who has them */}
      <section>
        <h3 className="mb-3 text-sm font-semibold tracking-widest text-gold uppercase">Given out</h3>

        {listError ? (
          <div className="mb-4">
            <Alert>{listError}</Alert>
          </div>
        ) : null}

        {comps.length === 0 ? (
          <EmptyState
            icon={<Users className="size-6" aria-hidden="true" />}
            title="Nobody yet"
            text="Tickets you give to guests are listed here, so you can take back any that are not used."
          />
        ) : (
          <ul className="space-y-3">
            {comps.map((c) => (
              <li key={c.orderId}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-fg">{c.recipient.fullName}</p>
                      <p className="text-sm text-muted">{c.recipient.email}</p>
                    </div>
                    <div className="text-right text-sm text-muted">
                      <p>
                        {c.quantity} × {c.ticketType ?? "ticket"}
                      </p>
                      <p className="text-xs">{formatDateTime(c.createdAt)}</p>
                    </div>
                  </div>

                  {c.note ? <p className="mt-2 text-xs text-muted">Note: {c.note}</p> : null}

                  <ul className="mt-3 divide-y divide-line border-t border-line">
                    {c.tickets.map((t, index) => (
                      <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <span className="flex items-center gap-2 text-fg">
                          Ticket {index + 1}
                          <Badge tone={t.status === "VALID" ? "ok" : "neutral"}>{TICKET_LABEL[t.status]}</Badge>
                        </span>
                        {t.status === "VALID" ? (
                          <Button size="sm" variant="ghost" onClick={() => setRevoking({ ticketId: t.id, guest: c.recipient.email })}>
                            Take back
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={revoking !== null}
        title="Take this ticket back?"
        confirmLabel="Take it back"
        danger
        loading={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking.ticketId)}
        onCancel={() => setRevoking(null)}
      >
        <p>{revoking?.guest} will no longer be able to use this ticket.</p>
        <p>It goes back to the tickets kept for guests, so you can give it to someone else. It does not go on public sale.</p>
      </ConfirmDialog>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/seller/EventGuests.tsx
// ==========================================