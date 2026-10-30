// ==========================================
// FILE: frontend/src/pages/seller/SellerOrders.tsx
// PURPOSE: Every sale on the seller's events, with a status filter and a CSV download.
// ==========================================
import { useState } from "react";
import { Download, Receipt } from "lucide-react";
import OrderStatusBadge from "../../components/OrderStatusBadge";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Chips from "../../components/ui/Chips";
import EmptyState from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { errorMessage } from "../../lib/api";
import { downloadCsv, toCsv } from "../../lib/csv";
import { formatDateTime, formatMoney } from "../../lib/format";
import { ORDER_STATUS_LABEL } from "../../lib/orders";
import { useAdminList } from "../../lib/useAdminList";
import { useTitle } from "../../lib/useTitle";
import type { OrderStatus } from "../../lib/types";

interface SellerOrderItem {
  id: string;
  quantity: number;
  subtotalCents: number;
  order: { reference: string; status: OrderStatus; createdAt: string; paidAt: string | null };
  ticketType: { name: string; currency: string; event: { title: string; slug: string } };
}

type Filter = "" | OrderStatus;

const FILTERS: { label: string; value: Filter }[] = [
  { label: "All", value: "" },
  { label: "Paid", value: "PAID" },
  { label: "Awaiting payment", value: "PENDING" },
  { label: "Refunded", value: "REFUNDED" },
  { label: "Cancelled", value: "CANCELLED" },
  { label: "Expired", value: "EXPIRED" },
];

export default function SellerOrders() {
  useTitle("Orders");

  const [filter, setFilter] = useState<Filter>("PAID");
  const { query, items, total } = useAdminList<SellerOrderItem>("seller-orders", "/sellers/orders", { status: filter }, 25);

  function download() {
    const csv = toCsv(
      ["Date", "Order", "Event", "Ticket", "Quantity", "Amount", "Currency", "Status"],
      items.map((i) => [
        formatDateTime(i.order.createdAt),
        i.order.reference,
        i.ticketType.event.title,
        i.ticketType.name,
        i.quantity,
        (i.subtotalCents / 100).toFixed(2),
        i.ticketType.currency,
        ORDER_STATUS_LABEL[i.order.status],
      ])
    );
    downloadCsv("sales.csv", csv);
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Chips label="Filter orders" options={FILTERS} value={filter} onChange={setFilter} />
        <Button variant="secondary" icon={<Download className="size-4" aria-hidden="true" />} disabled={items.length === 0} onClick={download}>
          Download CSV
        </Button>
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
          title="No orders here"
          text={filter ? "Try a different filter." : "Sales appear here as soon as people buy tickets."}
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">
            {total} {total === 1 ? "line" : "lines"}. One order can have several lines, one for each ticket type.
            {query.hasNextPage ? " Load everything before you download the CSV." : ""}
          </p>

          <Card className="overflow-x-auto">
            <table className="w-full min-w-176 text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs tracking-wide text-muted uppercase">
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold">Event</th>
                  <th className="px-5 py-3 font-semibold">Ticket</th>
                  <th className="px-5 py-3 text-right font-semibold">Qty</th>
                  <th className="px-5 py-3 text-right font-semibold">Amount</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 text-muted">
                      {formatDateTime(i.order.createdAt)}
                      <span className="block text-xs">{i.order.reference}</span>
                    </td>
                    <td className="px-5 py-3 font-medium text-fg">{i.ticketType.event.title}</td>
                    <td className="px-5 py-3 text-muted">{i.ticketType.name}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-fg">{i.quantity}</td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums text-fg">
                      {i.subtotalCents === 0 ? "Free" : formatMoney(i.subtotalCents, i.ticketType.currency)}
                    </td>
                    <td className="px-5 py-3">
                      <OrderStatusBadge status={i.order.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {query.hasNextPage ? (
            <div className="mt-6 flex justify-center">
              <Button variant="secondary" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                Load more
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/seller/SellerOrders.tsx
// ==========================================