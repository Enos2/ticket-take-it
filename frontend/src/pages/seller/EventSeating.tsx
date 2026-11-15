// ==========================================
// FILE: frontend/src/pages/seller/EventSeating.tsx
// PURPOSE: Draw the seat layout, keep seats for guests, give them out, and take the layout away again.
// ==========================================
import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Armchair as SeatIcon, Plus, Trash2 } from "lucide-react";
import SeatMap, { SeatLegend } from "../../components/SeatMap";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import EmptyState from "../../components/ui/EmptyState";
import { Field, SelectField } from "../../components/ui/Field";
import { PageSpinner } from "../../components/ui/Spinner";
import { api, errorMessage } from "../../lib/api";
import { TIER_LABEL } from "../../lib/events";
import { canEditEvent, canGiveOutTickets } from "../../lib/seller";
import { useInvalidateEvent } from "../../lib/useInvalidateEvent";
import { useManagedEvent } from "../../lib/useManagedEvent";
import { useTitle } from "../../lib/useTitle";
import type { BlockSeatsPayload, GiveSeatsPayload, GivenSeats, SaveLayoutPayload, SellerSeatMap, SellerSeatState } from "../../lib/seating";

// One section while it is being edited. Everything is text while the person types.
interface BuilderRow {
  name: string;
  ticketTypeId: string;
  rows: string;
  seatsPerRow: string;
}

type RowErrors = Partial<Record<keyof BuilderRow, string>>;

const MAX_SEATS = 10_000;

const toNumber = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : NaN);
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

// Turns the saved map back into editable rows.
function rowsFromMap(map: SellerSeatMap): BuilderRow[] {
  return map.sections.map((section) => ({
    name: section.name,
    ticketTypeId: section.ticketType.id,
    rows: String(section.rows.length),
    seatsPerRow: String(Math.max(...section.rows.map((r) => r.seats.length))),
  }));
}

function checkBuilder(rows: BuilderRow[]) {
  const errors: RowErrors[] = rows.map(() => ({}));
  let total = 0;
  const names = new Set<string>();

  rows.forEach((row, index) => {
    const name = row.name.trim();
    if (name.length < 1 || name.length > 40) errors[index].name = "Use 1 to 40 characters";
    else if (names.has(name.toLowerCase())) errors[index].name = "Two sections cannot have the same name";
    names.add(name.toLowerCase());

    if (!row.ticketTypeId) errors[index].ticketTypeId = "Choose a ticket type";

    const r = toNumber(row.rows);
    const s = toNumber(row.seatsPerRow);
    if (!Number.isInteger(r) || r < 1 || r > 60) errors[index].rows = "1 to 60 rows";
    if (!Number.isInteger(s) || s < 1 || s > 100) errors[index].seatsPerRow = "1 to 100 seats";
    if (Number.isInteger(r) && Number.isInteger(s)) total += r * s;
  });

  const tooMany = total > MAX_SEATS;
  const ok = !tooMany && errors.every((e) => Object.keys(e).length === 0);
  return { errors, total, tooMany, ok };
}

export default function EventSeating() {
  const { event } = useManagedEvent();
  useTitle(`${event.title} · Seating`);

  const invalidate = useInvalidateEvent();
  const editable = canEditEvent(event);
  const canGive = canGiveOutTickets(event);

  const query = useQuery({
    queryKey: ["seller-seating", event.id],
    queryFn: () => api.get<SellerSeatMap>(`/events/${event.id}/seating`),
  });

  const [building, setBuilding] = useState<BuilderRow[] | null>(null); // null means the layout is not being edited
  const [showErrors, setShowErrors] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [giving, setGiving] = useState(false);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function done(message: string | null) {
    invalidate(event);
    setError(null);
    setNotice(message);
    setSelected(new Set());
    setGiving(false);
    setEmail("");
    setNote("");
  }

  function failed(err: unknown) {
    setNotice(null);
    setError(errorMessage(err));
  }

  const save = useMutation({
    mutationFn: (payload: SaveLayoutPayload) => api.put<SellerSeatMap>(`/events/${event.id}/seating`, payload),
    onSuccess: () => {
      setBuilding(null);
      setShowErrors(false);
      done("The seat layout is saved. Buyers can now choose these seats.");
    },
    onError: failed,
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/events/${event.id}/seating`),
    onSuccess: () => {
      setConfirmRemove(false);
      done("The seat layout was removed.");
    },
    onError: (err) => {
      setConfirmRemove(false);
      failed(err);
    },
  });

  const block = useMutation({
    mutationFn: (payload: BlockSeatsPayload) => api.post<SellerSeatMap>(`/events/${event.id}/seating/block`, payload),
    onSuccess: (_map, variables) =>
      done(variables.blocked ? "The seats are kept for guests and are off public sale." : "The seats are back on public sale."),
    onError: failed,
  });

  const give = useMutation({
    mutationFn: (payload: GiveSeatsPayload) => api.post<GivenSeats>(`/events/${event.id}/seating/give`, payload),
    onSuccess: (result) =>
      done(`${result.seats} seat(s) were given to ${result.recipient.email}. The tickets are in their account.`),
    onError: failed,
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

  const map = query.data;
  const hasLayout = map.sections.length > 0;

  // ---- numbers about the map ----
  const stateById = new Map<string, SellerSeatState>();
  const totals = { seats: 0, available: 0, held: 0, sold: 0, blocked: 0, given: 0 };
  for (const section of map.sections) {
    for (const row of section.rows) {
      for (const seat of row.seats) {
        stateById.set(seat.id, seat.state);
        totals.seats += 1;
        totals[seat.state] += 1;
      }
    }
  }

  let pickedAvailable = 0;
  let pickedBlocked = 0;
  for (const id of selected) {
    const state = stateById.get(id);
    if (state === "available") pickedAvailable += 1;
    if (state === "blocked") pickedBlocked += 1;
  }
  const onlyAvailable = selected.size > 0 && pickedAvailable === selected.size;
  const onlyBlocked = selected.size > 0 && pickedBlocked === selected.size;

  function toggle(seatId: string) {
    setError(null);
    setNotice(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(seatId)) next.delete(seatId);
      else next.add(seatId);
      return next;
    });
  }

  function handleGive(e: FormEvent) {
    e.preventDefault();
    if (!EMAIL_PATTERN.test(email.trim())) {
      setShowErrors(true);
      return;
    }
    setError(null);
    give.mutate({ seatIds: [...selected], recipientEmail: email.trim().toLowerCase(), note: note.trim() || undefined });
  }

  // ---- the layout builder ----
  if (building !== null) {
    const checked = checkBuilder(building);

    const setRow = (index: number, patch: Partial<BuilderRow>) =>
      setBuilding((prev) => (prev ? prev.map((row, i) => (i === index ? { ...row, ...patch } : row)) : prev));

    function submitLayout(e: FormEvent) {
      e.preventDefault();
      if (!building || !checked.ok) {
        setShowErrors(true);
        return;
      }
      setError(null);
      save.mutate({
        sections: building.map((row) => ({
          name: row.name.trim(),
          ticketTypeId: row.ticketTypeId,
          rows: Number(row.rows),
          seatsPerRow: Number(row.seatsPerRow),
        })),
      });
    }

    return (
      <form onSubmit={submitLayout} className="space-y-6" noValidate>
        <div>
          <h3 className="text-lg font-bold text-fg">{hasLayout ? "Change the seat layout" : "Set up seating"}</h3>
          <p className="text-sm text-muted">
            Each section is a block of rows and seats, sold at the price of its ticket type. Rows are lettered A, B, C... and seats are numbered from 1.
          </p>
        </div>

        {error ? <Alert>{error}</Alert> : null}
        {hasLayout ? (
          <Alert variant="info">Saving replaces the current layout. This only works while no seat has been sold or is being held by a buyer.</Alert>
        ) : null}

        <ul className="space-y-4">
          {building.map((row, index) => (
            <li key={index}>
              <Card className="p-5">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field
                    label="Section name"
                    placeholder="Floor"
                    value={row.name}
                    onChange={(e) => setRow(index, { name: e.target.value })}
                    error={showErrors ? checked.errors[index].name : undefined}
                  />
                  <SelectField
                    label="Ticket type (sets the price)"
                    value={row.ticketTypeId}
                    onChange={(e) => setRow(index, { ticketTypeId: e.target.value })}
                    error={showErrors ? checked.errors[index].ticketTypeId : undefined}
                  >
                    <option value="">Choose...</option>
                    {event.ticketTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({TIER_LABEL[t.tier]})
                      </option>
                    ))}
                  </SelectField>
                  <Field
                    label="Rows"
                    inputMode="numeric"
                    value={row.rows}
                    onChange={(e) => setRow(index, { rows: e.target.value })}
                    error={showErrors ? checked.errors[index].rows : undefined}
                  />
                  <Field
                    label="Seats per row"
                    inputMode="numeric"
                    value={row.seatsPerRow}
                    onChange={(e) => setRow(index, { seatsPerRow: e.target.value })}
                    error={showErrors ? checked.errors[index].seatsPerRow : undefined}
                  />
                </div>
                {building.length > 1 ? (
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 className="size-4" aria-hidden="true" />}
                      onClick={() => setBuilding((prev) => (prev ? prev.filter((_, i) => i !== index) : prev))}
                    >
                      Remove section
                    </Button>
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <Button
            variant="secondary"
            icon={<Plus className="size-4" aria-hidden="true" />}
            onClick={() =>
              setBuilding((prev) => (prev ? [...prev, { name: "", ticketTypeId: event.ticketTypes[0]?.id ?? "", rows: "5", seatsPerRow: "10" }] : prev))
            }
          >
            Add section
          </Button>
          <p className={checked.tooMany ? "text-sm text-brand" : "text-sm text-muted"}>
            {checked.total} {checked.total === 1 ? "seat" : "seats"} in total{checked.tooMany ? ` (the most is ${MAX_SEATS})` : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={save.isPending}>
            Save layout
          </Button>
          <Button
            variant="ghost"
            disabled={save.isPending}
            onClick={() => {
              setBuilding(null);
              setShowErrors(false);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  // ---- no layout yet ----
  if (!hasLayout) {
    return (
      <div className="space-y-6">
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Alert variant="success">{notice}</Alert> : null}

        <EmptyState
          icon={<SeatIcon className="size-6" aria-hidden="true" />}
          title="This event sells general admission"
          text="Draw a seat layout to let buyers choose their own seats. Ticket types without seats keep selling as normal."
          action={
            editable ? (
              event.ticketTypes.length === 0 ? (
                <p className="text-sm text-muted">Add a ticket type on the Tickets tab first.</p>
              ) : (
                <Button
                  icon={<Plus className="size-4" aria-hidden="true" />}
                  onClick={() => {
                    setNotice(null);
                    setBuilding([{ name: "", ticketTypeId: event.ticketTypes[0]?.id ?? "", rows: "5", seatsPerRow: "10" }]);
                  }}
                >
                  Set up seating
                </Button>
              )
            ) : undefined
          }
        />
      </div>
    );
  }

  // ---- the map ----
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-fg">Seating</h3>
          <p className="text-sm text-muted">
            {totals.seats} seats · {totals.available} for sale · {totals.blocked + totals.given} kept for guests · {totals.sold} sold
            {totals.held > 0 ? ` · ${totals.held} held by buyers` : ""}
          </p>
        </div>
        {editable ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setNotice(null);
                setBuilding(rowsFromMap(map));
              }}
            >
              Change layout
            </Button>
            <Button variant="ghost" icon={<Trash2 className="size-4" aria-hidden="true" />} onClick={() => setConfirmRemove(true)}>
              Remove layout
            </Button>
          </div>
        ) : null}
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}

      <Card className="p-5">
        <SeatLegend states={["available", "selected", "blocked", "given", "sold", "held"]} />
        <p className="mt-3 text-xs text-muted">
          Select seats to keep them for guests (kept seats are off public sale), put them back on sale, or give them to a guest.
        </p>
        <div className="mt-5">
          <SeatMap
            sections={map.sections}
            selected={selected}
            isSelectable={(state: SellerSeatState) => editable && (state === "available" || state === "blocked")}
            onToggle={(seat) => toggle(seat.id)}
          />
        </div>
      </Card>

      {selected.size > 0 ? (
        <Card className="p-5">
          <p className="mb-4 text-sm text-fg" aria-live="polite">
            {selected.size} {selected.size === 1 ? "seat" : "seats"} selected
            {pickedAvailable > 0 ? ` · ${pickedAvailable} for sale` : ""}
            {pickedBlocked > 0 ? ` · ${pickedBlocked} kept for guests` : ""}
          </p>

          {giving ? (
            <form onSubmit={handleGive} className="space-y-4" noValidate>
              <Field
                label="Guest's email"
                type="email"
                placeholder="guest@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={showErrors && !EMAIL_PATTERN.test(email.trim()) ? "Enter the guest's email address" : undefined}
                hint="Your guest needs a Ticket Take It account with this email. The tickets appear in their account straight away."
                autoFocus
              />
              <Field label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} hint="Only you can see this." />
              <div className="flex flex-wrap gap-3">
                <Button type="submit" loading={give.isPending}>
                  Give seats
                </Button>
                <Button variant="ghost" disabled={give.isPending} onClick={() => setGiving(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={!onlyAvailable || !editable}
                loading={block.isPending && block.variables?.blocked === true}
                onClick={() => block.mutate({ seatIds: [...selected], blocked: true })}
              >
                Keep for guests
              </Button>
              <Button
                variant="secondary"
                disabled={!onlyBlocked || !editable}
                loading={block.isPending && block.variables?.blocked === false}
                onClick={() => block.mutate({ seatIds: [...selected], blocked: false })}
              >
                Put back on sale
              </Button>
              <Button
                variant="secondary"
                disabled={!onlyBlocked || !canGive}
                onClick={() => {
                  setShowErrors(false);
                  setGiving(true);
                }}
              >
                Give to a guest
              </Button>
              <Button variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          )}

          {!giving && selected.size > 0 && !onlyAvailable && !onlyBlocked ? (
            <p className="mt-3 text-xs text-muted">Select only seats for sale, or only seats kept for guests, to see what you can do with them.</p>
          ) : null}
        </Card>
      ) : null}

      <ConfirmDialog
        open={confirmRemove}
        title="Remove the seat layout?"
        confirmLabel="Remove layout"
        danger
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirmRemove(false)}
      >
        <p>All seats are removed and the ticket types go back to general admission.</p>
        <p>This only works while no seat has been sold or is held by a buyer.</p>
      </ConfirmDialog>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/seller/EventSeating.tsx
// ==========================================