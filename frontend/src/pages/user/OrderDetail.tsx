// ==========================================
// FILE: frontend/src/pages/user/OrderDetail.tsx
// PURPOSE: One order: what was bought, its status and, once paid, the tickets with QR codes.
// ==========================================
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Receipt } from "lucide-react";
import OrderStatusBadge from "../../components/OrderStatusBadge";
import TicketCard from "../../components/TicketCard";
import Alert from "../../components/ui/Alert";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { buttonClasses } from "../../components/ui/styles";
import { ApiRequestError, api, errorMessage } from "../../lib/api";
import { formatDateTime, formatMoney } from "../../lib/format";
import { isUnpaid, orderTitle } from "../../lib/orders";
import { useTitle } from "../../lib/useTitle";
import type { Order } from "../../lib/types";

export default function OrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const [params] = useSearchParams();
  const justPaid = params.get("paid") === "1";

  const query = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => api.get<Order>(`/orders/${orderId}`),
    enabled: Boolean(orderId),
  });

  const order = query.data;
  useTitle(order ? `Order ${order.reference}` : "Order");

  if (query.isPending) return <PageSpinner />;

  if (query.isError || !order) {
    const notFound = query.error instanceof ApiRequestError && query.error.status === 404;
    return notFound ? (
      <EmptyState
        icon={<Receipt className="size-6" aria-hidden="true" />}
        title="Order not found"
        action={
          <Link to="/account/orders" className={buttonClasses("secondary")}>
            My orders
          </Link>
        }
      />
    ) : (
      <Alert>{errorMessage(query.error)}</Alert>
    );
  }

  // Each ticket belongs to a ticket type, which tells us its name and event.
  const itemByType = new Map(order.items.map((item) => [item.ticketTypeId, item]));
  const showTickets = order.status === "PAID" || order.status === "REFUNDED";

  return (
    <div>
      <Link to="/account/orders" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden="true" />
        All orders
      </Link>

      {justPaid && order.status === "PAID" ? (
        <div className="mb-6">
          <Alert variant="success">
            {order.totalCents === 0 ? "Your tickets are ready." : "Payment received. Your tickets are ready."} We also emailed you a
            confirmation.
          </Alert>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-fg">{orderTitle(order)}</h2>
          <p className="mt-1 text-sm text-muted">
            Order {order.reference} · placed {formatDateTime(order.createdAt)}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <Card className="mt-6 p-6">
        <ul className="space-y-3 border-b border-line pb-5">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-4 text-sm">
              <span className="text-muted">
                <span className="font-semibold text-fg">{item.quantity} ×</span> {item.ticketType.name}
                {item.ticketType.event ? <span className="block text-xs">{item.ticketType.event.title}</span> : null}
              </span>
              <span className="shrink-0 font-medium text-fg">{formatMoney(item.subtotalCents, order.currency)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex items-baseline justify-between">
          <span className="text-sm text-muted">Total</span>
          <span className="text-xl font-extrabold text-fg">{formatMoney(order.totalCents, order.currency)}</span>
        </div>

        {isUnpaid(order.status) ? (
          <Link to={`/checkout/${order.id}`} className={`${buttonClasses("primary", "lg")} mt-6 w-full`}>
            Complete payment
          </Link>
        ) : null}
      </Card>

      {order.status === "REFUNDED" ? (
        <div className="mt-6">
          <Alert variant="info">
            This order was refunded and its tickets are no longer valid. Refunds can take a few days to reach you, depending on how
            you paid.
          </Alert>
        </div>
      ) : null}

      {order.status === "CANCELLED" || order.status === "EXPIRED" ? (
        <div className="mt-6">
          <Alert variant="info">This order was not paid, so no tickets were issued.</Alert>
        </div>
      ) : null}

      {showTickets && order.tickets.length > 0 ? (
        <section className="mt-10">
          <h3 className="mb-4 text-sm font-semibold tracking-widest text-gold uppercase">Your tickets</h3>
          <div className="space-y-4">
            {order.tickets.map((ticket) => {
              const item = itemByType.get(ticket.ticketTypeId);
              const event = item?.ticketType.event;
              return (
                <TicketCard
                  key={ticket.id}
                  ticketId={ticket.id}
                  code={ticket.code}
                  status={ticket.status}
                  ticketName={item?.ticketType.name ?? "Ticket"}
                  eventTitle={event?.title ?? "Event"}
                  startsAt={event?.startsAt}
                  venue={event ? `${event.venue}, ${event.city}` : undefined}
                  orderReference={order.reference}
                />
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/user/OrderDetail.tsx
// ==========================================