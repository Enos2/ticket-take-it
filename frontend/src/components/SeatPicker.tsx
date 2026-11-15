// ==========================================
// FILE: frontend/src/components/SeatPicker.tsx
// PURPOSE: Lets a visitor choose seats on the seat map and start an order for them.
// ==========================================
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/authStore";
import { isEventOver } from "../lib/events";
import { formatMoney } from "../lib/format";
import { MAX_SEATS_PER_ORDER } from "../lib/seating";
import type { MapSeat, MapSection, PublicSeatMap, PublicSeatState } from "../lib/seating";
import type { EventSummary, Order } from "../lib/types";
import SeatMap, { SeatLegend } from "./SeatMap";
import Alert from "./ui/Alert";
import Button from "./ui/Button";
import Card from "./ui/Card";

interface SeatPickerProps {
  event: EventSummary;
  map: PublicSeatMap;
}

export default function SeatPicker({ event, map }: SeatPickerProps) {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const over = isEventOver(event);

  // Every seat by id, so a chosen seat can be looked up with its section and price.
  const seatById = new Map<string, { seat: MapSeat<PublicSeatState>; section: MapSection<PublicSeatState> }>();
  for (const section of map.sections) {
    for (const row of section.rows) {
      for (const seat of row.seats) seatById.set(seat.id, { seat, section });
    }
  }

  // A seat someone else took while this page was open drops out of the choice by itself.
  const chosen = [...selected]
    .map((id) => seatById.get(id))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined && entry.seat.state === "available");

  const anyFree = [...seatById.values()].some((entry) => entry.seat.state === "available");
  const totalCents = chosen.reduce((sum, entry) => sum + entry.section.ticketType.priceCents, 0);
  const currency = chosen[0]?.section.ticketType.currency ?? map.sections[0]?.ticketType.currency ?? "KES";

  const createOrder = useMutation({
    mutationFn: (seatIds: string[]) => api.post<Order>("/orders", { items: [], seatIds }),
    onSuccess: (order) => {
      void queryClient.invalidateQueries({ queryKey: ["seat-map", event.id] });
      void queryClient.invalidateQueries({ queryKey: ["event", event.slug] });
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      navigate(order.status === "PAID" ? `/account/orders/${order.id}?paid=1` : `/checkout/${order.id}`);
    },
    onError: (err) => {
      setError(errorMessage(err));
      // Somebody may have taken a seat a moment ago. Show the real map.
      void queryClient.invalidateQueries({ queryKey: ["seat-map", event.id] });
    },
  });

  function toggle(seat: MapSeat<PublicSeatState>) {
    setError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(seat.id)) {
        next.delete(seat.id);
      } else if (next.size >= MAX_SEATS_PER_ORDER) {
        setError(`You can pick up to ${MAX_SEATS_PER_ORDER} seats at a time.`);
        return prev;
      } else {
        next.add(seat.id);
      }
      return next;
    });
  }

  function submit() {
    setError(null);

    if (!user) {
      navigate("/login", { state: { from: location.pathname } });
      return;
    }

    createOrder.mutate(chosen.map((entry) => entry.seat.id));
  }

  const buttonLabel = !user
    ? "Sign in to continue"
    : totalCents === 0
      ? "Get your free seats"
      : `Continue to checkout (${formatMoney(totalCents, currency)})`;

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-lg font-bold text-fg">Choose your seats</h3>
        <p className="text-sm text-muted">Pick up to {MAX_SEATS_PER_ORDER} seats. They are held for you for 15 minutes while you pay.</p>
      </div>

      <Card className="p-5">
        <SeatLegend states={["available", "selected", "held", "taken"]} />
        <div className="mt-5">
          <SeatMap
            sections={map.sections}
            selected={selected}
            isSelectable={(state) => state === "available" && !over}
            onToggle={(seat) => toggle(seat)}
          />
        </div>
      </Card>

      {over ? (
        <div className="mt-6">
          <Alert variant="info">This event has ended, so seats are no longer on sale.</Alert>
        </div>
      ) : !anyFree ? (
        <div className="mt-6">
          <Alert variant="info">
            <p className="font-semibold">Every seat is taken right now.</p>
            <p className="mt-1">If someone does not complete their payment, their seats are released, so check back later.</p>
          </Alert>
        </div>
      ) : (
        <Card className="mt-6 p-5">
          {chosen.length > 0 ? (
            <ul className="mb-4 space-y-2 border-b border-line pb-4 text-sm" aria-live="polite">
              {chosen.map(({ seat, section }) => {
                const row = section.rows.find((r) => r.seats.some((s) => s.id === seat.id));
                return (
                  <li key={seat.id} className="flex items-center justify-between gap-4">
                    <span className="text-fg">
                      {section.name} · Row {row?.row} · Seat {seat.number}
                    </span>
                    <span className="shrink-0 text-muted">{formatMoney(section.ticketType.priceCents, section.ticketType.currency)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mb-4 text-sm text-muted">Select the seats you would like on the map above.</p>
          )}

          {chosen.length > 0 ? (
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <span className="text-sm text-muted">
                {chosen.length} {chosen.length === 1 ? "seat" : "seats"}
              </span>
              <span className="text-xl font-extrabold text-fg">{formatMoney(totalCents, currency)}</span>
            </div>
          ) : null}

          {error ? (
            <div className="mb-4">
              <Alert>{error}</Alert>
            </div>
          ) : null}

          <Button size="lg" className="w-full" loading={createOrder.isPending} disabled={chosen.length === 0} onClick={submit}>
            {buttonLabel}
          </Button>
        </Card>
      )}
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/SeatPicker.tsx
// ==========================================