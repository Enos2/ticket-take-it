// ==========================================
// FILE: frontend/src/pages/user/CheckoutComplete.tsx
// PURPOSE: Where Paystack sends the customer back. Waits for the payment to be confirmed.
// ==========================================
import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock, XCircle } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import { Spinner } from "../../components/ui/Spinner";
import { buttonClasses } from "../../components/ui/styles";
import { usePaymentStatus } from "../../lib/usePaymentStatus";
import { useTitle } from "../../lib/useTitle";

export default function CheckoutComplete() {
  useTitle("Confirming payment");

  const [params] = useSearchParams();
  const orderId = params.get("orderId") ?? undefined;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const progress = usePaymentStatus(orderId, Boolean(orderId));
  const data = progress.data;

  // Confirmed: show the tickets.
  useEffect(() => {
    if (!data?.paid || !orderId) return;
    void queryClient.invalidateQueries({ queryKey: ["order", orderId] });
    void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
    void queryClient.invalidateQueries({ queryKey: ["my-tickets"] });
    navigate(`/account/orders/${orderId}?paid=1`, { replace: true });
  }, [data?.paid, orderId, navigate, queryClient]);

  if (!orderId) {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <Alert>This page needs an order. Open your orders to see where things stand.</Alert>
        <Link to="/account/orders" className={`${buttonClasses("secondary")} mt-6`}>
          My orders
        </Link>
      </div>
    );
  }

  const failed = data && !data.paid && data.failureReason;
  const closed = data && !data.paid && (data.orderStatus === "CANCELLED" || data.orderStatus === "EXPIRED");

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-20">
      <Card className="flex flex-col items-center p-8 text-center">
        {failed ? (
          <>
            <XCircle className="size-12 text-brand" aria-hidden="true" />
            <h1 className="mt-5 text-xl font-bold text-fg">The payment didn't go through</h1>
            <p className="mt-2 text-sm text-muted">{data.failureReason}</p>
            <Link to={`/checkout/${orderId}`} className={`${buttonClasses("primary")} mt-6`}>
              Try again
            </Link>
          </>
        ) : progress.timedOut ? (
          <>
            <Clock className="size-12 text-gold" aria-hidden="true" />
            <h1 className="mt-5 text-xl font-bold text-fg">Still waiting for confirmation</h1>
            <p className="mt-2 text-sm text-muted">
              Your bank or provider is taking longer than usual. If you were charged, your tickets will appear in your
              account and we will email you.
            </p>
            <Link to="/account/orders" className={`${buttonClasses("secondary")} mt-6`}>
              Go to my orders
            </Link>
            <Button variant="ghost" className="mt-2" onClick={() => window.location.reload()}>
              Check again
            </Button>
          </>
        ) : (
          <>
            <Spinner className="size-9" />
            <h1 className="mt-5 text-xl font-bold text-fg">Confirming your payment...</h1>
            <p className="mt-2 text-sm text-muted">This takes a few seconds. Please keep this page open.</p>
            {closed ? (
              <div className="mt-5 flex gap-3 rounded-lg border border-gold/40 bg-gold/10 p-3.5 text-left text-sm text-fg">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden="true" />
                <p>
                  Your reservation ended before the payment arrived. If you were charged, keep order reference{" "}
                  <span className="font-semibold">{data.reference}</span>. We will issue your tickets or refund you.
                </p>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/user/CheckoutComplete.tsx
// ==========================================