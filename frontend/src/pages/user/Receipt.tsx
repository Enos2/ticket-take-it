// ==========================================
// FILE: frontend/src/pages/user/Receipt.tsx
// PURPOSE: An itemised receipt for a paid order, ready to print or save as a PDF.
// ==========================================
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Printer, Receipt as ReceiptIcon } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { buttonClasses } from "../../components/ui/styles";
import { ApiRequestError, api, errorMessage } from "../../lib/api";
import { formatDateTime, formatMoney } from "../../lib/format";
import type { ReceiptData } from "../../lib/systemTypes";
import { useTitle } from "../../lib/useTitle";

const METHOD_LABEL: Record<ReceiptData["payments"][number]["method"], string> = {
  PAYSTACK: "Card or mobile money (Paystack)",
  MPESA: "M-Pesa",
  STRIPE: "Card",
  MANUAL: "Test payment",
};

export default function Receipt() {
  const { orderId } = useParams<{ orderId: string }>();

  const query = useQuery({
    queryKey: ["receipt", orderId],
    queryFn: () => api.get<ReceiptData>(`/receipts/${orderId}`),
    enabled: Boolean(orderId),
  });

  useTitle(query.data ? `Receipt ${query.data.reference}` : "Receipt");

  if (query.isPending) return <PageSpinner />;

  if (query.isError || !query.data) {
    const status = query.error instanceof ApiRequestError ? query.error.status : 0;
    return status === 404 || status === 400 ? (
      <EmptyState
        icon={<ReceiptIcon className="size-6" aria-hidden="true" />}
        title="No receipt for this order"
        text="A receipt is available once an order has been paid."
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

  const r = query.data;

  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link to={`/account/orders/${orderId}`} className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to the order
        </Link>
        <Button icon={<Printer className="size-4" aria-hidden="true" />} onClick={() => window.print()}>
          Print or save as PDF
        </Button>
      </div>

      <article className="rounded-2xl border border-line bg-panel p-6 sm:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
          <div>
            <p className="text-sm font-semibold tracking-widest text-gold uppercase">Ticket Take It</p>
            <h1 className="mt-1 text-3xl font-extrabold text-fg">Receipt</h1>
          </div>
          <div className="text-right text-sm text-muted">
            <p>
              Order <span className="font-semibold text-fg">{r.reference}</span>
            </p>
            {r.paidAt ? <p>Paid {formatDateTime(r.paidAt)}</p> : null}
          </div>
        </div>

        {r.status === "REFUNDED" ? (
          <p className="mt-6 rounded-lg border border-line p-3 text-sm text-fg">
            This order was refunded{r.refundedAt ? ` on ${formatDateTime(r.refundedAt)}` : ""}. The tickets on it are no longer valid.
          </p>
        ) : null}

        <div className="mt-6 text-sm text-muted">
          <p className="text-xs font-semibold tracking-widest text-gold uppercase">Billed to</p>
          <p className="mt-1 font-semibold text-fg">{r.buyer.fullName}</p>
          <p>{r.buyer.email}</p>
        </div>

        <table className="mt-8 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs tracking-wide text-muted uppercase">
              <th className="py-3 pr-4 font-semibold">Ticket</th>
              <th className="px-4 py-3 text-right font-semibold">Qty</th>
              <th className="px-4 py-3 text-right font-semibold">Price</th>
              <th className="py-3 pl-4 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {r.lines.map((line, i) => (
              <tr key={i} className="border-b border-line align-top">
                <td className="py-3 pr-4">
                  <span className="block font-medium text-fg">{line.eventTitle}</span>
                  <span className="block text-muted">{line.ticketName}</span>
                  <span className="block text-xs text-muted">
                    {formatDateTime(line.eventStartsAt)} · {line.venue}, {line.city}
                  </span>
                  <span className="block text-xs text-muted">Organiser: {line.organizer}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-fg">{line.quantity}</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted">{formatMoney(line.unitPriceCents, r.currency)}</td>
                <td className="py-3 pl-4 text-right font-medium tabular-nums text-fg">{formatMoney(line.subtotalCents, r.currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="pt-5 text-right text-sm text-muted">
                Total paid
              </td>
              <td className="pt-5 text-right text-xl font-extrabold tabular-nums text-fg">{formatMoney(r.totalCents, r.currency)}</td>
            </tr>
          </tfoot>
        </table>

        {r.payments.length > 0 ? (
          <div className="mt-8 text-sm text-muted">
            <p className="text-xs font-semibold tracking-widest text-gold uppercase">Payment</p>
            {r.payments.map((p, i) => (
              <p key={i} className="mt-1">
                {METHOD_LABEL[p.method]}
                {p.reference ? <span className="text-fg"> · reference {p.reference}</span> : null}
              </p>
            ))}
          </div>
        ) : null}

        <p className="mt-10 border-t border-line pt-6 text-xs text-muted">
          Thank you for your order. Ticket Take It sells tickets on behalf of the organisers named above. Keep this receipt for your records.
        </p>
      </article>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/user/Receipt.tsx
// ==========================================