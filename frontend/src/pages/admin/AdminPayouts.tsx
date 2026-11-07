// ==========================================
// FILE: frontend/src/pages/admin/AdminPayouts.tsx
// PURPOSE: Who is owed what, recording payouts after you send the money, commission rates and payout history.
// ==========================================
import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Percent, Wallet } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import EmptyState from "../../components/ui/EmptyState";
import { Field, SelectField, TextAreaField } from "../../components/ui/Field";
import { PageSpinner } from "../../components/ui/Spinner";
import { api, errorMessage } from "../../lib/api";
import { METHOD_LABEL, bpsText, changedRecently, money } from "../../lib/finance";
import { formatDateTime } from "../../lib/format";
import type { AdminBalances, BalanceRow, PayoutMethod, PayoutRow } from "../../lib/financeTypes";
import { centsToInput, parseMoneyToCents } from "../../lib/seller";
import { useAdminList } from "../../lib/useAdminList";
import { useTitle } from "../../lib/useTitle";

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Wallet; label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Icon className="size-4 text-gold" aria-hidden="true" />
        {label}
      </div>
      <div className="mt-2 text-xl font-extrabold text-fg tabular-nums">{value}</div>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}

// "7.5" becomes 750. Blank means "use the platform default". "invalid" means it can't be used.
function parsePercent(text: string): number | null | "invalid" {
  const t = text.trim();
  if (t === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return "invalid";
  const bps = Math.round(Number(t) * 100);
  return bps > 5000 ? "invalid" : bps;
}

export default function AdminPayouts() {
  useTitle("Payouts");
  const queryClient = useQueryClient();

  const [onlyDue, setOnlyDue] = useState(true);
  const [pay, setPay] = useState<BalanceRow | null>(null);
  const [rate, setRate] = useState<BalanceRow | null>(null);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PayoutMethod>("MPESA");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [percent, setPercent] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const balances = useQuery({
    queryKey: ["admin-balances", onlyDue],
    queryFn: () => api.get<AdminBalances>(`/finance/admin/balances?limit=100&onlyDue=${onlyDue}`),
  });
  const history = useAdminList<PayoutRow>("admin-payouts", "/finance/admin/payouts", {}, 15);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["admin-balances"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-payouts"] });
  }

  const record = useMutation({
    mutationFn: (body: { sellerId: string; currency: string; amountCents: number; method: PayoutMethod; reference?: string; note?: string }) =>
      api.post("/finance/admin/payouts", body),
    onSuccess: (_data, body) => {
      refresh();
      setPay(null);
      setError(null);
      setNotice(`Recorded a payout of ${money(body.amountCents, body.currency)}. The seller was emailed.`);
    },
    onError: (err) => setFormError(errorMessage(err)),
  });

  const setFee = useMutation({
    mutationFn: ({ sellerId, feeBps }: { sellerId: string; feeBps: number | null }) =>
      api.patch(`/finance/admin/sellers/${sellerId}/fee`, { feeBps }),
    onSuccess: (_data, { feeBps }) => {
      refresh();
      setRate(null);
      setError(null);
      setNotice(feeBps === null ? "That seller is back on the platform default rate." : `Commission for that seller is now ${bpsText(feeBps)}, from their next sale.`);
    },
    onError: (err) => setFormError(errorMessage(err)),
  });

  function openPay(row: BalanceRow) {
    setNotice(null);
    setError(null);
    setFormError(null);
    setAmount(centsToInput(row.availableCents));
    setMethod(row.seller?.payoutMethod === "BANK" ? "BANK" : "MPESA");
    setReference("");
    setNote("");
    setPay(row);
  }

  function openRate(row: BalanceRow) {
    setNotice(null);
    setError(null);
    setFormError(null);
    setPercent(row.seller?.feeBps != null ? String(row.seller.feeBps / 100) : "");
    setRate(row);
  }

  function confirmPay() {
    if (!pay) return;
    const cents = parseMoneyToCents(amount);
    if (cents === null || cents <= 0) return setFormError("Enter the amount you sent.");
    if (cents > pay.availableCents) return setFormError(`That is more than the ${money(pay.availableCents, pay.currency)} available.`);
    setFormError(null);
    record.mutate({
      sellerId: pay.sellerId,
      currency: pay.currency,
      amountCents: cents,
      method,
      reference: reference.trim() || undefined,
      note: note.trim() || undefined,
    });
  }

  function confirmRate() {
    if (!rate) return;
    const parsed = parsePercent(percent);
    if (parsed === "invalid") return setFormError("Enter a percentage between 0 and 50, for example 7.5.");
    setFormError(null);
    setFee.mutate({ sellerId: rate.sellerId, feeBps: parsed });
  }

  const data = balances.data;

  return (
    <div className="space-y-10">
      <Alert variant="info">
        Nothing here sends money. Pay the seller yourself (M-Pesa or bank), then record it so the books stay right and the seller is
        told. The default commission is {data ? bpsText(data.defaultFeeBps) : "5%"}, and earnings are released {data?.holdDays ?? 3} days
        after an event ends.
      </Alert>

      {notice ? <Alert variant="success">{notice}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      {data && data.totals.length > 0 ? (
        <section aria-label="Platform totals" className="space-y-6">
          {data.totals.map((t) => (
            <div key={t.currency}>
              {data.totals.length > 1 ? <h2 className="mb-3 text-sm font-semibold tracking-widest text-gold uppercase">{t.currency}</h2> : null}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat icon={Wallet} label="Ticket sales" value={money(t.grossCents, t.currency)} hint="After refunds" />
                <Stat icon={Percent} label="Your commission" value={money(t.commissionCents, t.currency)} />
                <Stat icon={Banknote} label="Owed to sellers" value={money(t.owedCents, t.currency)} hint="On hold plus available" />
                <Stat icon={Banknote} label="Paid out so far" value={money(t.paidOutCents, t.currency)} />
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-fg">Seller balances</h2>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-fg">
            <input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} className="size-4 accent-brand" />
            Only sellers with money due
          </label>
        </div>

        {balances.isPending ? (
          <PageSpinner />
        ) : balances.isError || !data ? (
          <div className="space-y-4">
            <Alert>{errorMessage(balances.error)}</Alert>
            <Button variant="secondary" onClick={() => void balances.refetch()}>
              Try again
            </Button>
          </div>
        ) : data.rows.length === 0 ? (
          <EmptyState
            icon={<Wallet className="size-6" aria-hidden="true" />}
            title={onlyDue ? "Nobody is waiting to be paid" : "No seller has earned anything yet"}
            text={onlyDue ? "Earnings become payable a few days after an event ends. Untick the box to see money still on hold." : undefined}
          />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-4xl text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs tracking-wide text-muted uppercase">
                  <th className="px-5 py-3 font-semibold">Seller</th>
                  <th className="px-5 py-3 text-right font-semibold">Available</th>
                  <th className="px-5 py-3 text-right font-semibold">On hold</th>
                  <th className="px-5 py-3 text-right font-semibold">Paid out</th>
                  <th className="px-5 py-3 font-semibold">Send to</th>
                  <th className="px-5 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const s = r.seller;
                  const active = s?.status === "APPROVED";
                  return (
                    <tr key={`${r.sellerId}-${r.currency}`} className="border-b border-line align-top last:border-0">
                      <td className="px-5 py-3">
                        <span className="block font-medium text-fg">{s?.businessName ?? "Unknown seller"}</span>
                        <span className="block text-xs text-muted">{s?.user.email}</span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          {s && !active ? <Badge tone="brand">{s.status.toLowerCase()}</Badge> : null}
                          <Badge>{bpsText(s?.feeBps ?? data.defaultFeeBps)}{s?.feeBps == null ? " default" : " custom"}</Badge>
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-fg tabular-nums">{money(r.availableCents, r.currency)}</td>
                      <td className="px-5 py-3 text-right text-muted tabular-nums">{money(r.pendingCents, r.currency)}</td>
                      <td className="px-5 py-3 text-right text-muted tabular-nums">{money(r.paidOutCents, r.currency)}</td>
                      <td className="px-5 py-3 text-muted">
                        {s?.payoutDetails ? (
                          <>
                            <span className="block text-fg">{METHOD_LABEL[s.payoutMethod === "BANK" ? "BANK" : "MPESA"]}</span>
                            <span className="block wrap-break-word">{s.payoutDetails}</span>
                            {changedRecently(s.payoutUpdatedAt) ? <Badge tone="gold">Changed this week</Badge> : null}
                          </>
                        ) : (
                          <span className="text-xs">Not added yet</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" disabled={r.availableCents <= 0 || !active} onClick={() => openPay(r)}>
                            Record payout
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openRate(r)}>
                            Rate
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-bold text-fg">Payout history</h2>
        {history.items.length === 0 ? (
          <Card className="p-6 text-sm text-muted">No payouts recorded yet.</Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-160 text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs tracking-wide text-muted uppercase">
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold">Seller</th>
                  <th className="px-5 py-3 font-semibold">Method</th>
                  <th className="px-5 py-3 font-semibold">Reference</th>
                  <th className="px-5 py-3 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {history.items.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 text-muted">{formatDateTime(p.createdAt)}</td>
                    <td className="px-5 py-3 text-fg">{p.seller?.businessName ?? "-"}</td>
                    <td className="px-5 py-3 text-muted">{METHOD_LABEL[p.method]}</td>
                    <td className="px-5 py-3 text-muted">{p.reference ?? "-"}</td>
                    <td className="px-5 py-3 text-right font-medium text-fg tabular-nums">{money(p.amountCents, p.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        {history.query.hasNextPage ? (
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" loading={history.query.isFetchingNextPage} onClick={() => void history.query.fetchNextPage()}>
              Load more
            </Button>
          </div>
        ) : null}
      </section>

      <ConfirmDialog
        open={pay !== null}
        title={`Record a payout to ${pay?.seller?.businessName ?? "this seller"}`}
        confirmLabel="Record payout"
        loading={record.isPending}
        onConfirm={confirmPay}
        onCancel={() => setPay(null)}
      >
        <p>Do this only after the money has really been sent. It leaves their available balance and they are emailed.</p>
        <div className="space-y-4 pt-2">
          {formError ? <Alert>{formError}</Alert> : null}
          {pay && !pay.seller?.payoutDetails ? <Alert variant="info">This seller has not added payout details yet.</Alert> : null}
          {pay?.seller && changedRecently(pay.seller.payoutUpdatedAt) ? (
            <Alert variant="info">Their payout details changed in the last 7 days. Make sure the change was really theirs before you send.</Alert>
          ) : null}
          {pay?.seller?.payoutDetails ? (
            <p className="text-sm text-fg">
              Send to: <span className="font-semibold">{pay.seller.payoutDetails}</span>
            </p>
          ) : null}

          <Field
            label={`Amount sent (${pay?.currency ?? ""})`}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            hint={pay ? `Up to ${money(pay.availableCents, pay.currency)}. You can pay part of it.` : undefined}
          />
          <SelectField label="Sent by" value={method} onChange={(e) => setMethod(e.target.value as PayoutMethod)}>
            <option value="MPESA">M-Pesa</option>
            <option value="BANK">Bank transfer</option>
            <option value="OTHER">Other</option>
          </SelectField>
          <Field label="Reference (optional)" value={reference} maxLength={100} placeholder="M-Pesa receipt or bank reference" onChange={(e) => setReference(e.target.value)} />
          <TextAreaField label="Note (optional)" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={rate !== null}
        title={`Commission for ${rate?.seller?.businessName ?? "this seller"}`}
        confirmLabel="Save rate"
        loading={setFee.isPending}
        onConfirm={confirmRate}
        onCancel={() => setRate(null)}
      >
        <p>This applies to their sales from now on. Sales already made keep the rate they were made at.</p>
        <div className="space-y-4 pt-2">
          {formError ? <Alert>{formError}</Alert> : null}
          <Field
            label="Commission (%)"
            inputMode="decimal"
            value={percent}
            placeholder={data ? String(data.defaultFeeBps / 100) : "5"}
            onChange={(e) => setPercent(e.target.value)}
            hint={`Leave it empty to use the platform default of ${data ? bpsText(data.defaultFeeBps) : "5%"}. The most you can set is 50%.`}
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/admin/AdminPayouts.tsx
// ==========================================