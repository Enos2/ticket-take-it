// ==========================================
// FILE: frontend/src/pages/admin/AdminResale.tsx
// PURPOSE: Resale money that is owed to sellers. After sending it, mark it as paid.
// ==========================================
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Store } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { api, errorMessage } from "../../lib/api";
import { formatDateTime, formatMoney } from "../../lib/format";
import { useTitle } from "../../lib/useTitle";
import type { OwedProceeds } from "../../lib/resale";

export default function AdminResale() {
  useTitle("Resale payouts");

  const queryClient = useQueryClient();
  const [references, setReferences] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["admin-resale-owed"],
    queryFn: () => api.get<OwedProceeds[]>("/resale/admin/owed"),
  });

  const markPaid = useMutation({
    mutationFn: ({ id, reference }: { id: string; reference: string }) =>
      api.post(`/resale/admin/listings/${id}/paid`, { reference: reference.trim() || undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-resale-owed"] });
      setError(null);
      setNotice("Marked as paid.");
    },
    onError: (err) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-resale-owed"] });
      setNotice(null);
      setError(errorMessage(err));
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

  const owed = query.data;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-fg">Resale payouts</h2>
        <p className="text-sm text-muted">
          People whose tickets were resold are owed the sale price minus our commission. Send it to the M-Pesa number shown, then mark it as paid.
        </p>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}

      {owed.length === 0 ? (
        <EmptyState
          icon={<Store className="size-6" aria-hidden="true" />}
          title="No resale money waiting"
          text="When a resold ticket is paid for, the seller's share appears here."
        />
      ) : (
        <ul className="space-y-3">
          {owed.map((item) => (
            <li key={item.id}>
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-fg">{item.seller.fullName}</p>
                    <p className="text-sm text-muted">{item.seller.email}</p>
                    <p className="mt-2 text-sm text-muted">
                      {item.ticket.event.title} · {item.ticket.ticketType.name}
                      {item.soldAt ? ` · sold ${formatDateTime(item.soldAt)}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-extrabold text-fg">{formatMoney(item.netCents ?? item.priceCents, item.currency)}</p>
                    <p className="text-xs text-muted">
                      sold for {formatMoney(item.priceCents, item.currency)}, commission {formatMoney(item.feeCents ?? 0, item.currency)}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-gold">M-Pesa {item.payoutPhone}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
                  <input
                    type="text"
                    value={references[item.id] ?? ""}
                    onChange={(e) => setReferences((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    placeholder="M-Pesa receipt (optional)"
                    maxLength={100}
                    aria-label={`M-Pesa receipt for ${item.seller.fullName}`}
                    className="min-w-0 flex-1 rounded-lg border border-line bg-ink px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-gold focus:outline-none"
                  />
                  <Button
                    size="sm"
                    loading={markPaid.isPending && markPaid.variables?.id === item.id}
                    onClick={() => markPaid.mutate({ id: item.id, reference: references[item.id] ?? "" })}
                  >
                    Mark as paid
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/admin/AdminResale.tsx
// ==========================================