// ==========================================
// FILE: frontend/src/pages/admin/AdminOrders.tsx
// PURPOSE: Find any order and refund it.
// ==========================================
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
import OrderStatusBadge from "../../components/OrderStatusBadge";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Chips from "../../components/ui/Chips";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import EmptyState from "../../components/ui/EmptyState";
import { Field } from "../../components/ui/Field";
import { PageSpinner } from "../../components/ui/Spinner";
import SearchInput from "../../components/ui/SearchInput";
import { api, errorMessage } from "../../lib/api";
import type { AdminOrder, RefundOrderResult } from "../../lib/adminTypes";
import { formatDateTime, formatMoney } from "../../lib/format";
import { useAdminList } from "../../lib/useAdminList";
import { useDebouncedValue } from "../../lib/useDebounce";
import { useTitle } from "../../lib/useTitle";
import type { OrderStatus } from "../../lib/types";

type Filter = "" | OrderStatus;

const FILTERS: { label: string; value: Filter }[] = [
  { label: "All", value: "" },
  { label: "Paid", value: "PAID" },
  { label: "Awaiting payment", value: "PENDING" },
  { label: "Refunded", value: "REFUNDED" },
  { label: "Cancelled", value: "CANCELLED" },
  { label: "Expired", value: "EXPIRED" },
];

const eventTitles = (order: AdminOrder) => [...new Set(order.items.map((i) => i.ticketType.event.title))].join(", ");

export default function AdminOrders() {
  useTitle("Orders");
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<Filter>("");
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim());

  const [refunding, setRefunding] = useState<AdminOrder | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RefundOrderResult | null>(null);

  const { query, items, total } = useAdminList<AdminOrder>("admin-orders", "/admin/orders", { status: filter, q });

  const refund = useMutation({
    mutationFn: (order: AdminOrder) =>
      api.post<RefundOrderResult>(`/admin/orders/${order.id}/refund`, reason.trim() ? { reason: reason.trim() } : {}),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-refunds"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      setRefunding(null);
      setReason("");
      setError(null);
      setResult(data);
    },
    onError: (err) => {
      setRefunding(null);
      setResult(null);
      setError(errorMessage(err));
    },
  });

  return (
    <div>
      <div className="mb-6 space-y-5">
        <div className="max-w-md">
          <SearchInput label="Search" value={search} onChange={setSearch} placeholder="Order reference or buyer's email" />
        </div>
        <Chips label="Filter orders" options={FILTERS} value={filter} onChange={setFilter} />
      </div>

      <div className="mb-6 space-y-3 empty:hidden">
        {error ? <Alert>{error}</Alert> : null}

        {result ? (
          <Alert variant="success">
            <p className="font-semibold">Order {result.reference} refunded and its tickets cancelled.</p>
            {result.payments.length === 0 ? (
              <p className="mt-1">Nothing was charged for this order, so there is no money to return.</p>
            ) : result.manualRefundRequired ? (
              <p className="mt-1">
                The money still has to be returned to the customer. It is waiting in the{" "}
                <Link to="/admin/refunds" className="font-semibold text-gold underline-offset-4 hover:underline">
                  Refunds tab
                </Link>
                .
              </p>
            ) : (
              <p className="mt-1">The money was returned automatically.</p>
            )}
          </Alert>
        ) : null}
      </div>

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
          icon={<Receipt className="size-6" aria-hidden="true" />}
          title="No orders found"
          text={q || filter ? "Try a different search or filter." : undefined}
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">
            {total} {total === 1 ? "order" : "orders"}
          </p>

          <ul className="space-y-3">
            {items.map((order) => {
              const quantity = order.items.reduce((sum, i) => sum + i.quantity, 0);
              return (
                <li key={order.id}>
                  <Card className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-fg">{order.reference}</h2>
                        <OrderStatusBadge status={order.status} />
                      </div>
                      <p className="mt-1 truncate text-sm text-muted">{eventTitles(order)}</p>
                      <p className="mt-0.5 text-sm text-muted">
                        {order.user.fullName} ({order.user.email})
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {quantity} {quantity === 1 ? "ticket" : "tickets"} · {formatMoney(order.totalCents, order.currency)} ·{" "}
                        {formatDateTime(order.createdAt)}
                      </p>
                    </div>

                    {order.status === "PAID" ? (
                      <Button
                        size="sm"
                        variant="danger"
                        className="shrink-0"
                        onClick={() => {
                          setResult(null);
                          setError(null);
                          setReason("");
                          setRefunding(order);
                        }}
                      >
                        Refund order
                      </Button>
                    ) : null}
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
        open={refunding !== null}
        title={`Refund order ${refunding?.reference ?? ""}?`}
        confirmLabel="Refund order"
        danger
        loading={refund.isPending}
        onConfirm={() => refunding && refund.mutate(refunding)}
        onCancel={() => setRefunding(null)}
      >
        <p>
          The tickets are cancelled and the customer is emailed. This works only if none of the tickets were used at the door.
        </p>
        <p>
          {refunding ? formatMoney(refunding.totalCents, refunding.currency) : ""} is returned automatically for Paystack payments.
          For M-Pesa you return it by hand from the Refunds tab.
        </p>
        <div className="pt-2">
          <Field
            label="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="For example: customer asked for a refund"
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/admin/AdminOrders.tsx
// ==========================================