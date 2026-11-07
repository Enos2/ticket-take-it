// ==========================================
// FILE: frontend/src/pages/seller/SellerEarnings.tsx
// PURPOSE: A seller's balances, payout details, payout history and every ledger entry.
// ==========================================
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Banknote, Clock, Percent, Wallet } from "lucide-react";
import PayoutDetailsForm from "../../components/seller/PayoutDetailsForm";
import Alert from "../../components/ui/Alert";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { api, errorMessage } from "../../lib/api";
import { LEDGER_LABEL, LEDGER_TONE, METHOD_LABEL, bpsText, money } from "../../lib/finance";
import { formatDate, formatDateTime } from "../../lib/format";
import type { Earnings, LedgerRow, PayoutRow } from "../../lib/financeTypes";
import { useAdminList } from "../../lib/useAdminList";
import { useTitle } from "../../lib/useTitle";

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Wallet; label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Icon className="size-4 text-gold" aria-hidden="true" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-extrabold text-fg tabular-nums">{value}</div>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}

export default function SellerEarnings() {
  useTitle("Earnings");

  const earnings = useQuery({
    queryKey: ["seller-earnings"],
    queryFn: () => api.get<Earnings>("/finance/earnings"),
    refetchInterval: 60_000,
  });
  const ledger = useAdminList<LedgerRow>("seller-ledger", "/finance/ledger", {}, 20);
  const payouts = useAdminList<PayoutRow>("seller-payouts", "/finance/payouts", {}, 10);

  if (earnings.isPending) return <PageSpinner />;

  if (earnings.isError) {
    return (
      <div className="space-y-4">
        <Alert>{errorMessage(earnings.error)}</Alert>
        <Button variant="secondary" onClick={() => void earnings.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const e = earnings.data;
  const several = e.currencies.length > 1;

  return (
    <div className="space-y-10">
      <Alert variant="info">
        Buyers pay the ticket price. We keep <span className="font-semibold">{bpsText(e.feeBps)}</span> as commission and the rest is
        yours. Earnings from an event can be paid out {e.holdDays} {e.holdDays === 1 ? "day" : "days"} after it ends, so cancellations
        and refunds can be settled first.
      </Alert>

      {e.currencies.length === 0 ? (
        <EmptyState
          icon={<Wallet className="size-6" aria-hidden="true" />}
          title="No earnings yet"
          text="When people buy tickets to your events, your earnings appear here."
        />
      ) : (
        e.currencies.map((c) => (
          <section key={c.currency} aria-label={`Earnings in ${c.currency}`}>
            {several ? <h2 className="mb-3 text-sm font-semibold tracking-widest text-gold uppercase">{c.currency}</h2> : null}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat icon={Wallet} label="Available to withdraw" value={money(c.availableCents, c.currency)} hint="Ready to be paid out" />
              <Stat icon={Clock} label="On hold" value={money(c.pendingCents, c.currency)} hint={`Released ${e.holdDays} days after each event`} />
              <Stat icon={Banknote} label="Paid out" value={money(c.paidOutCents, c.currency)} hint="Already sent to you" />
              <Stat icon={Percent} label="Commission" value={money(c.feesCents, c.currency)} hint={`On ${money(c.grossCents, c.currency)} of sales`} />
            </div>
          </section>
        ))
      )}

      <PayoutDetailsForm key={e.payoutUpdatedAt ?? "none"} earnings={e} />

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-widest text-gold uppercase">Payouts</h2>
        {payouts.items.length === 0 ? (
          <Card className="p-6 text-sm text-muted">No payouts yet. We pay available earnings to the details above.</Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-120 text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs tracking-wide text-muted uppercase">
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold">Method</th>
                  <th className="px-5 py-3 font-semibold">Reference</th>
                  <th className="px-5 py-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payouts.items.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 text-muted">{formatDateTime(p.createdAt)}</td>
                    <td className="px-5 py-3 text-fg">{METHOD_LABEL[p.method]}</td>
                    <td className="px-5 py-3 text-muted">{p.reference ?? "-"}</td>
                    <td className="px-5 py-3 text-right font-medium text-fg tabular-nums">{money(p.amountCents, p.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        {payouts.query.hasNextPage ? (
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" loading={payouts.query.isFetchingNextPage} onClick={() => void payouts.query.fetchNextPage()}>
              Load more payouts
            </Button>
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-widest text-gold uppercase">Every transaction</h2>
        {ledger.query.isPending ? (
          <PageSpinner />
        ) : ledger.items.length === 0 ? (
          <Card className="p-6 text-sm text-muted">Nothing yet.</Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-160 text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs tracking-wide text-muted uppercase">
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold">What</th>
                  <th className="px-5 py-3 font-semibold">Type</th>
                  <th className="px-5 py-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {ledger.items.map((row) => {
                  const onHold = row.type !== "PAYOUT" && new Date(row.availableAt).getTime() > Date.now();
                  return (
                    <tr key={row.id} className="border-b border-line last:border-0">
                      <td className="px-5 py-3 text-muted">{formatDateTime(row.createdAt)}</td>
                      <td className="px-5 py-3 text-fg">
                        {row.description ?? "-"}
                        {onHold ? <span className="block text-xs text-muted">On hold until {formatDate(row.availableAt)}</span> : null}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={LEDGER_TONE[row.type]}>{LEDGER_LABEL[row.type]}</Badge>
                      </td>
                      <td className={`px-5 py-3 text-right font-medium tabular-nums ${row.amountCents < 0 ? "text-brand" : "text-fg"}`}>
                        {money(row.amountCents, row.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
        {ledger.query.hasNextPage ? (
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" loading={ledger.query.isFetchingNextPage} onClick={() => void ledger.query.fetchNextPage()}>
              Load more
            </Button>
          </div>
        ) : null}
        <p className="mt-3 text-xs text-muted">
          Amounts in red take money away: commission, refunds and payouts. A refund also returns its commission.
        </p>
      </section>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/seller/SellerEarnings.tsx
// ==========================================