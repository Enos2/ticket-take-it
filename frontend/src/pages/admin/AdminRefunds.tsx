// ==========================================
// FILE: frontend/src/pages/admin/AdminRefunds.tsx
// PURPOSE: The refund queue: money that has to go back to customers, until it is returned.
// ==========================================
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Mail, Phone } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import EmptyState from "../../components/ui/EmptyState";
import { Field } from "../../components/ui/Field";
import { PageSpinner } from "../../components/ui/Spinner";
import { PROVIDER_LABEL, metaNumber, metaText, refundHowTo, refundReason } from "../../lib/admin";
import type { RefundAttempt, RefundQueueItem } from "../../lib/adminTypes";
import { api, errorMessage } from "../../lib/api";
import { formatDateTime, formatMoney } from "../../lib/format";
import { useAdminList } from "../../lib/useAdminList";
import { useTitle } from "../../lib/useTitle";

type Notice = { kind: "success" | "info" | "error"; text: string };

export default function AdminRefunds() {
  useTitle("Refunds");
  const queryClient = useQueryClient();

  const [resolving, setResolving] = useState<RefundQueueItem | null>(null);
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);

  const { query, items, total } = useAdminList<RefundQueueItem>("admin-refunds", "/admin/payments/needs-refund", {});

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["admin-refunds"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    void queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
  }

  const retry = useMutation({
    mutationFn: (item: RefundQueueItem) => api.post<RefundAttempt>(`/admin/payments/${item.id}/retry-refund`),
    onSuccess: (attempt) => {
      refresh();
      if (attempt.outcome === "refunded") {
        setNotice({ kind: "success", text: `Refunded ${formatMoney(attempt.amountCents, attempt.currency)} through ${PROVIDER_LABEL[attempt.provider]}.` });
      } else {
        setNotice({
          kind: "error",
          text: attempt.detail ? `The refund did not go through: ${attempt.detail}` : "The refund did not go through. It stays in the queue.",
        });
      }
    },
    onError: (err) => setNotice({ kind: "error", text: errorMessage(err) }),
  });

  const resolve = useMutation({
    mutationFn: (item: RefundQueueItem) =>
      api.post(`/admin/payments/${item.id}/resolve-refund`, note.trim() ? { note: note.trim() } : {}),
    onSuccess: () => {
      refresh();
      setResolving(null);
      setNote("");
      setNotice({ kind: "success", text: "Marked as returned. It is out of the queue." });
    },
    onError: (err) => {
      setResolving(null);
      setNotice({ kind: "error", text: errorMessage(err) });
    },
  });

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-fg">Money to return to customers</h2>
        <p className="mt-1 text-sm text-muted">
          Refunded orders, double charges, wrong amounts and payments that arrived after tickets sold out all land here until you
          mark them returned.
        </p>
      </div>

      {notice ? (
        <div className="mb-6">
          <Alert variant={notice.kind}>{notice.text}</Alert>
        </div>
      ) : null}

      {query.isPending ? (
        <PageSpinner />
      ) : query.isError ? (
        <div className="space-y-4">
          <Alert>{errorMessage(query.error)}</Alert>
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="size-6" aria-hidden="true" />}
          title="Nothing to return"
          text="Every refund has been handled."
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">
            {total} {total === 1 ? "payment" : "payments"} waiting, oldest first
          </p>

          <ul className="space-y-3">
            {items.map((item) => {
              const lastError = metaText(item.metadata, "lastRefundError");
              const expected = metaNumber(item.metadata, "expectedCents");
              const refundNote = metaText(item.metadata, "refundNote");

              return (
                <li key={item.id}>
                  <Card className="space-y-4 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xl font-extrabold text-fg">{formatMoney(item.amountCents, item.currency)}</span>
                          <Badge tone="gold">{PROVIDER_LABEL[item.provider]}</Badge>
                          <Badge tone="brand">{refundReason(item.metadata)}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          Order {item.order.reference} · paid {formatDateTime(item.createdAt)}
                          {item.providerRef ? ` · ref ${item.providerRef}` : ""}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {item.provider === "PAYSTACK" ? (
                          <Button
                            size="sm"
                            loading={retry.isPending && retry.variables?.id === item.id}
                            disabled={retry.isPending || resolve.isPending}
                            onClick={() => {
                              setNotice(null);
                              retry.mutate(item);
                            }}
                          >
                            Retry automatic refund
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={retry.isPending || resolve.isPending}
                          onClick={() => {
                            setNotice(null);
                            setNote("");
                            setResolving(item);
                          }}
                        >
                          Mark as returned
                        </Button>
                      </div>
                    </div>

                    <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
                      <li>
                        <span className="font-semibold text-fg">{item.order.user.fullName}</span>
                      </li>
                      <li className="flex items-center gap-1.5">
                        <Mail className="size-4 text-gold" aria-hidden="true" />
                        {item.order.user.email}
                      </li>
                      {item.order.user.phone ? (
                        <li className="flex items-center gap-1.5">
                          <Phone className="size-4 text-gold" aria-hidden="true" />
                          {item.order.user.phone}
                        </li>
                      ) : null}
                    </ul>

                    {expected !== null ? (
                      <p className="text-sm text-muted">The order was for {formatMoney(expected, item.currency)}.</p>
                    ) : null}
                    {refundNote ? <p className="text-sm text-muted">Note from the refund: {refundNote}</p> : null}
                    {lastError ? <Alert>Last attempt failed: {lastError}</Alert> : null}

                    <p className="text-sm text-muted">{refundHowTo(item.provider)}</p>
                  </Card>
                </li>
              );
            })}
          </ul>

          {query.hasNextPage ? (
            <div className="mt-8 flex justify-center">
              <Button variant="secondary" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                Load more
              </Button>
            </div>
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={resolving !== null}
        title="Mark this payment as returned?"
        confirmLabel="Yes, it was returned"
        loading={resolve.isPending}
        onConfirm={() => resolving && resolve.mutate(resolving)}
        onCancel={() => setResolving(null)}
      >
        <p>
          Only do this after {resolving ? formatMoney(resolving.amountCents, resolving.currency) : "the money"} has really gone back to{" "}
          {resolving?.order.user.fullName ?? "the customer"}. It leaves the queue and can't be put back.
        </p>
        <div className="pt-2">
          <Field
            label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="For example: M-Pesa reversal receipt"
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/admin/AdminRefunds.tsx
// ==========================================