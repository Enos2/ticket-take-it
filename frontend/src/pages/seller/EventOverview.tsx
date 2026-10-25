// ==========================================
// FILE: frontend/src/pages/seller/EventOverview.tsx
// PURPOSE: Sales, revenue and door numbers for one event.
// ==========================================
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import { PageSpinner } from "../../components/ui/Spinner";
import { api, errorMessage } from "../../lib/api";
import { TIER_LABEL } from "../../lib/events";
import { formatMoney } from "../../lib/format";
import { useManagedEvent } from "../../lib/useManagedEvent";
import { useTitle } from "../../lib/useTitle";
import type { EventSalesSummary } from "../../lib/types";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-fg tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}

export default function EventOverview() {
  const { event } = useManagedEvent();
  useTitle(`${event.title} · Overview`);

  const query = useQuery({
    queryKey: ["seller-summary", event.id],
    queryFn: () => api.get<EventSalesSummary>(`/sellers/events/${event.id}/summary`),
    refetchInterval: 30_000, // pauses while the tab is in the background
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

  const { totals, ticketTypes } = query.data;
  const currency = totals.currency ?? "KES";
  const checkInPercent = totals.ticketsIssued > 0 ? Math.round((totals.checkedIn / totals.ticketsIssued) * 100) : 0;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Revenue" value={formatMoney(totals.revenueCents, currency) === "Free" ? "0" : formatMoney(totals.revenueCents, currency)} hint="From paid orders" />
        <Stat label="Tickets issued" value={String(totals.ticketsIssued)} hint="Paid and free" />
        <Stat label="Checked in" value={String(totals.checkedIn)} />
        <Stat label="Not yet arrived" value={String(totals.notYetArrived)} />
      </div>

      <Card className="p-5">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="font-semibold text-fg">Check-in progress</h3>
          <span className="text-sm text-muted tabular-nums">
            {totals.checkedIn} of {totals.ticketsIssued} ({checkInPercent}%)
          </span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-ink"
          role="progressbar"
          aria-valuenow={checkInPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Check-in progress"
        >
          <div className="h-full rounded-full bg-ok" style={{ width: `${checkInPercent}%` }} />
        </div>
      </Card>

      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <h3 className="text-sm font-semibold tracking-widest text-gold uppercase">Sales by ticket type</h3>
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw className="size-4" aria-hidden="true" />}
            loading={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Refresh
          </Button>
        </div>

        {ticketTypes.length === 0 ? (
          <Card className="p-6 text-sm text-muted">No ticket types yet. Add some on the Tickets tab.</Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-136 text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs tracking-wide text-muted uppercase">
                  <th className="px-5 py-3 font-semibold">Ticket</th>
                  <th className="px-5 py-3 text-right font-semibold">Price</th>
                  <th className="px-5 py-3 text-right font-semibold">Paid</th>
                  <th className="px-5 py-3 text-right font-semibold">Left</th>
                  <th className="px-5 py-3 text-right font-semibold">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {ticketTypes.map((t) => (
                  <tr key={t.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3">
                      <span className="font-medium text-fg">{t.name}</span>
                      <span className="ml-2 text-xs text-muted">{TIER_LABEL[t.tier]}</span>
                      {!t.isActive ? (
                        <span className="ml-2">
                          <Badge>Off sale</Badge>
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted">{formatMoney(t.priceCents, t.currency)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-fg">{t.paidQuantity}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted">
                      {t.available} of {t.quantity}
                    </td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums text-fg">
                      {t.revenueCents === 0 ? "0" : formatMoney(t.revenueCents, t.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        <p className="mt-3 text-xs text-muted">
          "Left" does not count tickets held for unpaid orders, which are released after 15 minutes. This page refreshes by itself
          every 30 seconds.
        </p>
      </section>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/seller/EventOverview.tsx
// ==========================================