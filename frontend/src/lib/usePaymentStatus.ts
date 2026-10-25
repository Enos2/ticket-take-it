// ==========================================
// FILE: frontend/src/lib/usePaymentStatus.ts
// PURPOSE: Checks every few seconds whether an order has been paid.
// ==========================================
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { PaymentProgress } from "./types";

const POLL_MS = 3_000;

// While `enabled`, asks the server about the payment until the order is paid or `maxMs` pass.
export function usePaymentStatus(orderId: string | undefined, enabled: boolean, maxMs = 10 * 60_000) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    setTimedOut(false);
    if (!enabled || !orderId) return;
    const id = window.setTimeout(() => setTimedOut(true), maxMs);
    return () => window.clearTimeout(id);
  }, [orderId, enabled, maxMs]);

  const query = useQuery({
    queryKey: ["payment-status", orderId],
    queryFn: () => api.get<PaymentProgress>(`/payments/status/${orderId}`),
    enabled: Boolean(orderId) && enabled && !timedOut,
    refetchInterval: (q) => (q.state.data?.paid ? false : POLL_MS),
    staleTime: 0,
    gcTime: 0,
  });

  return { ...query, timedOut };
}
// ==========================================
// END OF FILE: frontend/src/lib/usePaymentStatus.ts
// ==========================================