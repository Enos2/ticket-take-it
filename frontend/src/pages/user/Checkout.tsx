// ==========================================
// FILE: frontend/src/pages/user/Checkout.tsx
// PURPOSE: Pay for a held order with Paystack (card or mobile money) or an M-Pesa prompt.
// ==========================================
import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, CreditCard, ShieldCheck, Smartphone } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import { Field } from "../../components/ui/Field";
import { PageSpinner, Spinner } from "../../components/ui/Spinner";
import { buttonClasses } from "../../components/ui/styles";
import { ApiRequestError, api, errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/authStore";
import { cx } from "../../lib/cx";
import { formatMoney } from "../../lib/format";
import { formatCountdown, isUnpaid, orderTitle } from "../../lib/orders";
import { useCountdown } from "../../lib/useCountdown";
import { usePaymentStatus } from "../../lib/usePaymentStatus";
import { useTitle } from "../../lib/useTitle";
import type { InitializedPayment, Order, PaymentMethods } from "../../lib/types";

type Provider = "PAYSTACK" | "MPESA";

// Same rule the server applies: Safaricom numbers, with or without the country code.
const looksLikeKenyanPhone = (value: string) => /^(?:\+?254|0)?[17]\d{8}$/.test(value.replace(/[\s-]/g, ""));

export default function Checkout() {
  useTitle("Checkout");

  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);

  const orderQuery = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => api.get<Order>(`/orders/${orderId}`),
    enabled: Boolean(orderId),
  });

  const methodsQuery = useQuery({
    queryKey: ["payment-methods"],
    queryFn: () => api.get<PaymentMethods>("/payments/methods"),
    staleTime: 5 * 60_000,
  });

  const order = orderQuery.data;
  const secondsLeft = useCountdown(order?.reservationExpiresAt);
  const expired = secondsLeft === 0;

  const [chosen, setChosen] = useState<Provider | null>(null);
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false); // an M-Pesa prompt is on the customer's phone
  const [slow, setSlow] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const progress = usePaymentStatus(orderId, waiting);

  // The prompt has been on the phone for a while: tell the customer what their options are.
  useEffect(() => {
    if (!waiting) {
      setSlow(false);
      return;
    }
    const id = window.setTimeout(() => setSlow(true), 90_000);
    return () => window.clearTimeout(id);
  }, [waiting]);

  // Paid: go to the tickets.
  useEffect(() => {
    if (!progress.data?.paid || !orderId) return;
    void queryClient.invalidateQueries({ queryKey: ["order", orderId] });
    void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
    void queryClient.invalidateQueries({ queryKey: ["my-tickets"] });
    navigate(`/account/orders/${orderId}?paid=1`, { replace: true });
  }, [progress.data?.paid, orderId, navigate, queryClient]);

  // The customer cancelled the prompt, entered a wrong PIN, and so on.
  useEffect(() => {
    const reason = progress.data?.failureReason;
    if (waiting && reason) {
      setWaiting(false);
      setError(reason);
    }
  }, [progress.data?.failureReason, waiting]);

  const pay = useMutation({
    mutationFn: (provider: Provider) =>
      api.post<InitializedPayment>(
        `/payments/initialize/${orderId}`,
        provider === "MPESA" ? { provider, phone: phone.trim() } : { provider }
      ),
    onSuccess: (data) => {
      if (data.provider === "PAYSTACK") {
        window.location.assign(data.authorizationUrl); // the page is replaced, so there is nothing more to do here
        return;
      }
      // Forget any earlier failed attempt, so it can't end this one straight away.
      queryClient.removeQueries({ queryKey: ["payment-status", orderId] });
      setWaiting(true);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const cancel = useMutation({
    mutationFn: () => api.post<Order>(`/orders/${orderId}/cancel`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      navigate("/events", { replace: true });
    },
    onError: (err) => {
      setConfirmCancel(false);
      setError(errorMessage(err));
    },
  });

  if (orderQuery.isPending) return <PageSpinner />;

  if (orderQuery.isError || !order) {
    const notFound = orderQuery.error instanceof ApiRequestError && orderQuery.error.status === 404;
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        {notFound ? (
          <EmptyState
            icon={<Clock className="size-6" aria-hidden="true" />}
            title="Order not found"
            action={
              <Link to="/events" className={buttonClasses("secondary")}>
                Browse events
              </Link>
            }
          />
        ) : (
          <Alert>{errorMessage(orderQuery.error)}</Alert>
        )}
      </div>
    );
  }

  if (order.status === "PAID") return <Navigate to={`/account/orders/${order.id}`} replace />;

  if (!isUnpaid(order.status)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={<Clock className="size-6" aria-hidden="true" />}
          title={order.status === "REFUNDED" ? "This order was refunded" : "This order can no longer be paid"}
          text="Your reservation has ended. You can pick your tickets again."
          action={
            <Link to="/events" className={buttonClasses("primary")}>
              Browse events
            </Link>
          }
        />
      </div>
    );
  }

  // Which payment buttons exist depends on what the server has switched on.
  const methods = methodsQuery.data;
  const options: { id: Provider; title: string; text: string; icon: typeof CreditCard }[] = [];
  if (methods?.paystack) {
    options.push({
      id: "PAYSTACK",
      title: "Card or mobile money",
      text: "You will be taken to Paystack's secure page to finish paying.",
      icon: CreditCard,
    });
  }
  if (methods?.mpesa && order.currency === "KES") {
    options.push({
      id: "MPESA",
      title: "M-Pesa",
      text: "We send a payment prompt to your phone. Enter your PIN to approve it.",
      icon: Smartphone,
    });
  }

  const selected = chosen ?? options[0]?.id ?? null;
  const phoneOk = looksLikeKenyanPhone(phone);
  const total = formatMoney(order.totalCents, order.currency);
  const busy = pay.isPending || pay.isSuccess; // after Paystack succeeds the page is about to be replaced

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-extrabold text-fg">Checkout</h1>
      <p className="mt-1 text-sm text-muted">Order {order.reference}</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-5">
        {/* payment */}
        <div className="lg:col-span-3">
          {expired ? (
            <Alert>
              Your reservation has expired and the tickets were released.{" "}
              <Link to="/events" className="font-semibold text-gold underline-offset-4 hover:underline">
                Choose your tickets again
              </Link>
              .
            </Alert>
          ) : waiting ? (
            <Card className="flex flex-col items-center p-8 text-center">
              <Spinner className="size-9" />
              <h2 className="mt-5 text-xl font-bold text-fg">Check your phone</h2>
              <p className="mt-2 max-w-sm text-sm text-muted">
                Enter your M-Pesa PIN to approve {total}. This page updates by itself as soon as the payment is confirmed.
              </p>
              {slow ? (
                <p className="mt-4 max-w-sm text-sm text-gold">
                  Taking a while? If you already approved the payment, your tickets will appear shortly. If the prompt never
                  arrived, you can try again.
                </p>
              ) : null}
              <Button variant="secondary" className="mt-6" onClick={() => setWaiting(false)}>
                Try again or choose another method
              </Button>
            </Card>
          ) : (
            <Card className="p-6 sm:p-8">
              <h2 className="text-lg font-bold text-fg">Payment method</h2>

              {error ? (
                <div className="mt-4">
                  <Alert>{error}</Alert>
                </div>
              ) : null}

              {methodsQuery.isPending ? (
                <div className="mt-6 flex justify-center">
                  <Spinner />
                </div>
              ) : options.length === 0 ? (
                <div className="mt-4">
                  <Alert variant="info">Online payments are not available right now. Please try again later.</Alert>
                </div>
              ) : (
                <>
                  <fieldset className="mt-5 space-y-3">
                    <legend className="sr-only">Choose how to pay</legend>
                    {options.map((option) => (
                      <label
                        key={option.id}
                        className={cx(
                          "flex cursor-pointer gap-4 rounded-xl border p-4 transition-colors",
                          selected === option.id ? "border-gold bg-gold/5" : "border-line hover:border-muted"
                        )}
                      >
                        <input
                          type="radio"
                          name="method"
                          className="mt-1 accent-brand"
                          checked={selected === option.id}
                          onChange={() => {
                            setChosen(option.id);
                            setError(null);
                          }}
                        />
                        <option.icon className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden="true" />
                        <span>
                          <span className="block font-semibold text-fg">{option.title}</span>
                          <span className="mt-0.5 block text-sm text-muted">{option.text}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>

                  {selected === "MPESA" ? (
                    <div className="mt-5">
                      <Field
                        label="M-Pesa phone number"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="0712 345 678"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        error={phone && !phoneOk ? "Enter a valid Safaricom number, for example 0712345678" : undefined}
                      />
                    </div>
                  ) : null}

                  <Button
                    size="lg"
                    className="mt-6 w-full"
                    loading={busy}
                    disabled={!selected || (selected === "MPESA" && !phoneOk)}
                    onClick={() => {
                      if (!selected) return;
                      setError(null);
                      pay.mutate(selected);
                    }}
                  >
                    {selected === "MPESA" ? `Send M-Pesa prompt for ${total}` : `Pay ${total}`}
                  </Button>

                  <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted">
                    <ShieldCheck className="size-4 text-gold" aria-hidden="true" />
                    Payments are processed securely. We never see your card details.
                  </p>
                </>
              )}
            </Card>
          )}
        </div>

        {/* summary */}
        <aside className="lg:col-span-2">
          <Card className="p-6 lg:sticky lg:top-28">
            <h2 className="text-lg font-bold text-fg">Order summary</h2>
            <p className="mt-1 text-sm text-gold">{orderTitle(order)}</p>

            <ul className="mt-5 space-y-3 border-b border-line pb-5">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-4 text-sm">
                  <span className="text-muted">
                    <span className="font-semibold text-fg">{item.quantity} ×</span> {item.ticketType.name}
                  </span>
                  <span className="shrink-0 font-medium text-fg">{formatMoney(item.subtotalCents, order.currency)}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex items-baseline justify-between">
              <span className="text-sm text-muted">Total</span>
              <span className="text-2xl font-extrabold text-fg">{total}</span>
            </div>

            {secondsLeft !== null && !expired ? (
              <p className="mt-5 flex items-center gap-2 rounded-lg bg-ink p-3 text-sm text-muted">
                <Clock className="size-4 shrink-0 text-gold" aria-hidden="true" />
                Tickets held for <span className="font-semibold text-fg tabular-nums">{formatCountdown(secondsLeft)}</span>
              </p>
            ) : null}

            <div className="mt-5 border-t border-line pt-4">
              {confirmCancel ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted">Cancel this order?</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(false)}>
                      Keep it
                    </Button>
                    <Button size="sm" variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>
                      Yes, cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmCancel(true)}
                  className="text-sm text-muted underline-offset-4 transition-colors hover:text-brand hover:underline"
                >
                  Cancel this order
                </button>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/user/Checkout.tsx
// ==========================================