// ==========================================
// FILE: frontend/src/pages/user/MyOrders.tsx
// PURPOSE: Every order the signed-in person has placed.
// ==========================================
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronRight, Receipt } from "lucide-react";
import OrderStatusBadge from "../../components/OrderStatusBadge";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { buttonClasses } from "../../components/ui/styles";
import { api, errorMessage } from "../../lib/api";
import { formatDateTime, formatMoney } from "../../lib/format";
import { isUnpaid, orderTitle } from "../../lib/orders";
import { useTitle } from "../../lib/useTitle";
import type { Order } from "../../lib/types";

export default function MyOrders() {
  useTitle("My orders");

  const query = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => api.get<Order[]>("/orders/my-orders"),
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

  const orders = query.data;

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<Receipt className="size-6" aria-hidden="true" />}
        title="No orders yet"
        text="When you buy tickets, your orders show up here."
        action={
          <Link to="/events" className={buttonClasses("primary")}>
            Browse events
          </Link>
        }
      />
    );
  }

  return (
    <ul className="space-y-3">
      {orders.map((order) => {
        const ticketCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
        return (
          <li key={order.id}>
            <Link
              to={`/account/orders/${order.id}`}
              className="group flex items-center gap-4 rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-gold/60"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate font-semibold text-fg">{orderTitle(order)}</h2>
                  <OrderStatusBadge status={order.status} />
                </div>
                <p className="mt-1 text-sm text-muted">
                  {ticketCount} {ticketCount === 1 ? "ticket" : "tickets"} · {formatMoney(order.totalCents, order.currency)} ·{" "}
                  {formatDateTime(order.createdAt)}
                </p>
                <p className="mt-0.5 text-xs text-muted">Order {order.reference}</p>
                {isUnpaid(order.status) ? <p className="mt-2 text-sm font-semibold text-gold">Complete payment</p> : null}
              </div>
              <ChevronRight className="size-5 shrink-0 text-muted transition-colors group-hover:text-gold" aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/user/MyOrders.tsx
// ==========================================