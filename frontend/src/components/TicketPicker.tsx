// ==========================================
// FILE: frontend/src/components/TicketPicker.tsx
// PURPOSE: Lets a visitor choose tickets on the event page and start an order.
// ==========================================
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { Clock, Minus, Plus, Users } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/authStore";
import { cx } from "../lib/cx";
import { TIER_LABEL, isEventOver, saleState, ticketsLeft } from "../lib/events";
import { formatDateTime, formatMoney } from "../lib/format";
import type { EventSummary, Order, TicketType } from "../lib/types";
import Alert from "./ui/Alert";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import Card from "./ui/Card";

// The server allows up to 100. Twenty is plenty for one tap-and-go purchase.
const MAX_PER_TICKET = 20;

interface Row {
  ticket: TicketType;
  state: "open" | "upcoming" | "ended";
  min: number;
  max: number;
}

function buildRow(ticket: TicketType): Row {
  const left = ticketsLeft(ticket);
  const grouped = ticket.isGroup && ticket.minGroupSize && ticket.maxGroupSize;

  return {
    ticket,
    state: saleState(ticket),
    min: grouped ? (ticket.minGroupSize as number) : 1,
    max: grouped ? Math.min(ticket.maxGroupSize as number, left) : Math.min(left, MAX_PER_TICKET),
  };
}

interface TicketPickerProps {
  event: EventSummary;
  tickets: TicketType[];
}

export default function TicketPicker({ event, tickets }: TicketPickerProps) {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const over = isEventOver(event);
  const rows = tickets.map(buildRow);
  const qty = (row: Row) => quantities[row.ticket.id] ?? 0;

  const selected = rows.filter((row) => qty(row) > 0);
  const totalCents = selected.reduce((sum, row) => sum + row.ticket.priceCents * qty(row), 0);
  const ticketCount = selected.reduce((sum, row) => sum + qty(row), 0);
  const currency = tickets[0]?.currency ?? "KES";

  // Stock can change while the page is open. Selections that no longer fit must be adjusted first.
  const outOfRange = selected.some((row) => qty(row) > row.max || qty(row) < row.min);

  const createOrder = useMutation({
    mutationFn: (items: { ticketTypeId: string; quantity: number }[]) => api.post<Order>("/orders", { items }),
    onSuccess: (order) => {
      // Stock changed, so anything showing availability is out of date.
      void queryClient.invalidateQueries({ queryKey: ["event", event.slug] });
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      void queryClient.invalidateQueries({ queryKey: ["my-orders"] });

      // Free orders are paid instantly and go straight to the tickets.
      navigate(order.status === "PAID" ? `/account/orders/${order.id}?paid=1` : `/checkout/${order.id}`);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function change(row: Row, delta: 1 | -1) {
    setError(null);
    setQuantities((prev) => {
      const current = prev[row.ticket.id] ?? 0;
      const next = delta > 0 ? (current === 0 ? row.min : current + 1) : current <= row.min ? 0 : current - 1;
      if (next > row.max) return prev;
      return { ...prev, [row.ticket.id]: next };
    });
  }

  function submit() {
    setError(null);

    if (!user) {
      navigate("/login", { state: { from: location.pathname } });
      return;
    }

    createOrder.mutate(selected.map((row) => ({ ticketTypeId: row.ticket.id, quantity: qty(row) })));
  }

  const buttonLabel = !user
    ? "Sign in to continue"
    : totalCents === 0
      ? "Get your free tickets"
      : `Continue to checkout (${formatMoney(totalCents, currency)})`;

  return (
    <div>
      <ul className="space-y-3">
        {rows.map((row) => {
          const { ticket } = row;
          const left = ticketsLeft(ticket);
          const q = qty(row);
          const soldOut = left === 0;
          const tooFewForGroup = !soldOut && row.max < row.min;
          const buyable = !over && row.state === "open" && !soldOut && !tooFewForGroup;

          return (
            <li
              key={ticket.id}
              className={cx(
                "flex flex-col gap-4 rounded-xl border bg-ink p-4 transition-colors sm:flex-row sm:items-center sm:justify-between",
                q > 0 ? "border-gold" : "border-line"
              )}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-fg">{ticket.name}</h3>
                  <Badge tone={ticket.tier === "VIP" ? "gold" : "neutral"}>{TIER_LABEL[ticket.tier]}</Badge>
                </div>

                {ticket.description ? <p className="mt-1 text-sm text-muted">{ticket.description}</p> : null}

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  {ticket.tier === "EARLY_BIRD" && ticket.endsAt && row.state === "open" ? (
                    <span className="flex items-center gap-1.5">
                      <Clock className="size-3.5 text-gold" aria-hidden="true" />
                      Early bird price until {formatDateTime(ticket.endsAt)}
                    </span>
                  ) : null}
                  {ticket.isGroup && ticket.minGroupSize && ticket.maxGroupSize ? (
                    <span className="flex items-center gap-1.5">
                      <Users className="size-3.5 text-gold" aria-hidden="true" />
                      Groups of {ticket.minGroupSize} to {ticket.maxGroupSize}
                    </span>
                  ) : null}
                  {buyable && left <= 10 ? <span className="font-medium text-gold">Only {left} left</span> : null}
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-between gap-5 sm:flex-col sm:items-end sm:justify-center sm:gap-2">
                <span className="text-lg font-bold text-fg">{formatMoney(ticket.priceCents, ticket.currency)}</span>

                {buyable ? (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => change(row, -1)}
                      disabled={q === 0}
                      aria-label={`Remove one ${ticket.name} ticket`}
                      className="flex size-9 items-center justify-center rounded-lg border border-line text-fg transition-colors hover:border-gold disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Minus className="size-4" aria-hidden="true" />
                    </button>
                    <span className="w-6 text-center text-base font-semibold text-fg tabular-nums" aria-live="polite">
                      {q}
                    </span>
                    <button
                      type="button"
                      onClick={() => change(row, 1)}
                      disabled={q >= row.max}
                      aria-label={`Add one ${ticket.name} ticket`}
                      className="flex size-9 items-center justify-center rounded-lg border border-line text-fg transition-colors hover:border-gold disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                ) : soldOut ? (
                  <Badge tone="brand">Sold out</Badge>
                ) : tooFewForGroup ? (
                  <span className="text-xs text-muted">Not enough left for a group</span>
                ) : row.state === "upcoming" && ticket.startsAt ? (
                  <span className="text-xs text-muted">On sale from {formatDateTime(ticket.startsAt)}</span>
                ) : row.state === "ended" ? (
                  <span className="text-xs text-muted">Sale ended</span>
                ) : (
                  <span className="text-xs text-muted">Not on sale</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {over ? (
        <div className="mt-6">
          <Alert variant="info">This event has ended, so tickets are no longer on sale.</Alert>
        </div>
      ) : (
        <Card className="mt-6 p-5">
          {ticketCount > 0 ? (
            <div className="mb-4 flex items-baseline justify-between gap-4" aria-live="polite">
              <span className="text-sm text-muted">
                {ticketCount} {ticketCount === 1 ? "ticket" : "tickets"}
              </span>
              <span className="text-xl font-extrabold text-fg">{formatMoney(totalCents, currency)}</span>
            </div>
          ) : (
            <p className="mb-4 text-sm text-muted">Choose how many tickets you would like.</p>
          )}

          {error ? (
            <div className="mb-4">
              <Alert>{error}</Alert>
            </div>
          ) : null}

          {outOfRange ? (
            <div className="mb-4">
              <Alert variant="info">Availability changed. Adjust your tickets to continue.</Alert>
            </div>
          ) : null}

          <Button
            size="lg"
            className="w-full"
            loading={createOrder.isPending}
            disabled={ticketCount === 0 || outOfRange}
            onClick={submit}
          >
            {buttonLabel}
          </Button>

          {user ? (
            <p className="mt-3 text-center text-xs text-muted">
              Your tickets are held for 15 minutes while you pay.
            </p>
          ) : null}
        </Card>
      )}
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/TicketPicker.tsx
// ==========================================