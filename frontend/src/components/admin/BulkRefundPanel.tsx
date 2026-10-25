// ==========================================
// FILE: frontend/src/components/admin/BulkRefundPanel.tsx
// PURPOSE: Refunds every paid order of a cancelled event, 25 at a time, and shows progress.
// ==========================================
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../../lib/api";
import type { BulkRefundResult } from "../../lib/adminTypes";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Card from "../ui/Card";
import { Spinner } from "../ui/Spinner";

interface BulkRefundPanelProps {
  event: { id: string; title: string };
  onClose: () => void;
}

type Phase = "running" | "done" | "error";

// A safety stop: 200 batches of 25 is 5000 orders.
const MAX_BATCHES = 200;

export default function BulkRefundPanel({ event, onClose }: BulkRefundPanelProps) {
  const queryClient = useQueryClient();
  const started = useRef(false);

  const [phase, setPhase] = useState<Phase>("running");
  const [refunded, setRefunded] = useState(0);
  const [failed, setFailed] = useState<{ reference: string; error: string }[]>([]);
  const [needsReview, setNeedsReview] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return; // React runs effects twice in development
    started.current = true;

    async function run() {
      let total = 0;
      const failures = new Map<string, string>();

      try {
        for (let batch = 0; batch < MAX_BATCHES; batch++) {
          const result = await api.post<BulkRefundResult>(`/admin/events/${event.id}/refund-orders`, {
            reason: "Event cancelled",
          });

          total += result.refunded;
          for (const f of result.failed) failures.set(f.reference, f.error);

          setRefunded(total);
          setFailed([...failures].map(([reference, message]) => ({ reference, error: message })));
          setNeedsReview(result.needsReview);

          // Orders that failed stay eligible, so stop as soon as a batch refunds nothing.
          if (result.refunded === 0 || result.remaining === 0) break;
        }
        setPhase("done");
      } catch (err) {
        setError(errorMessage(err));
        setPhase("error");
      } finally {
        void queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
        void queryClient.invalidateQueries({ queryKey: ["admin-refunds"] });
        void queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
        void queryClient.invalidateQueries({ queryKey: ["admin-events"] });
      }
    }

    void run();
  }, [event.id, queryClient]);

  return (
    <Card className="mb-6 p-6" aria-live="polite">
      {phase === "running" ? (
        <div className="flex items-center gap-4">
          <Spinner className="size-7" />
          <div>
            <h3 className="font-bold text-fg">Refunding orders for {event.title}</h3>
            <p className="text-sm text-muted">{refunded} refunded so far. Please keep this page open.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-ok" aria-hidden="true" />
            <div>
              <h3 className="font-bold text-fg">
                {phase === "error" ? "Stopped early" : "Finished"}: {refunded} {refunded === 1 ? "order" : "orders"} refunded for{" "}
                {event.title}
              </h3>
              <p className="mt-1 text-sm text-muted">
                Tickets are cancelled and customers are emailed. Check the{" "}
                <Link to="/admin/refunds" className="font-semibold text-gold underline-offset-4 hover:underline">
                  Refunds tab
                </Link>{" "}
                for money that still has to be returned by hand.
              </p>
            </div>
          </div>

          {error ? <Alert>{error}</Alert> : null}

          {failed.length > 0 ? (
            <Alert>
              <p className="font-semibold">{failed.length} could not be refunded:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {failed.map((f) => (
                  <li key={f.reference}>
                    {f.reference}: {f.error}
                  </li>
                ))}
              </ul>
            </Alert>
          ) : null}

          {needsReview > 0 ? (
            <Alert variant="info">
              {needsReview} {needsReview === 1 ? "order needs" : "orders need"} a person to decide: a ticket was already used, or the
              order also contains tickets for another event. Find them under Orders.
            </Alert>
          ) : null}

          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
    </Card>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/admin/BulkRefundPanel.tsx
// ==========================================