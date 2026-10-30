// ==========================================
// FILE: frontend/src/pages/admin/AdminOverview.tsx
// PURPOSE: Platform numbers and a list of what needs attention.
// ==========================================
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarCheck, CalendarDays, Receipt, Ticket, Users, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import { PageSpinner } from "../../components/ui/Spinner";
import { api, errorMessage } from "../../lib/api";
import { revenueText } from "../../lib/admin";
import type { AdminStats } from "../../lib/adminTypes";
import { useTitle } from "../../lib/useTitle";

function Stat({ icon: Icon, label, children, hint }: { icon: typeof Users; label: string; children: ReactNode; hint?: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Icon className="size-4 text-gold" aria-hidden="true" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-extrabold text-fg tabular-nums">{children}</div>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}

const linkClass = "font-semibold text-gold underline-offset-4 hover:underline";

export default function AdminOverview() {
  useTitle("Admin overview");

  const query = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => api.get<AdminStats>("/admin/stats"),
    refetchInterval: 60_000,
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

  const s = query.data;
  const needsAttention = s.pendingSellers > 0 || s.pendingEvents > 0 || s.paymentsNeedingRefund > 0;

  return (
    <div className="space-y-8">
      {needsAttention ? (
        <section className="space-y-3" aria-label="Needs attention">
          {s.pendingEvents > 0 ? (
            <Alert variant="info">
              <Link to="/admin/events" className={linkClass}>
                {s.pendingEvents} {s.pendingEvents === 1 ? "event is" : "events are"} waiting for your review
              </Link>
            </Alert>
          ) : null}
          {s.pendingSellers > 0 ? (
            <Alert variant="info">
              <Link to="/admin/sellers" className={linkClass}>
                {s.pendingSellers} seller {s.pendingSellers === 1 ? "application is" : "applications are"} waiting for review
              </Link>
            </Alert>
          ) : null}
          {s.paymentsNeedingRefund > 0 ? (
            <Alert>
              <Link to="/admin/refunds" className={linkClass}>
                {s.paymentsNeedingRefund} {s.paymentsNeedingRefund === 1 ? "payment needs" : "payments need"} money returned to a
                customer
              </Link>
            </Alert>
          ) : null}
        </section>
      ) : (
        <Alert variant="success">Nothing needs your attention right now.</Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat icon={Wallet} label="Revenue" hint="From paid orders, before refunds">
          {s.revenue.length === 0 ? (
            "0"
          ) : (
            <ul className="space-y-0.5">
              {s.revenue.map((r) => (
                <li key={r.currency}>{revenueText(r.totalCents, r.currency)}</li>
              ))}
            </ul>
          )}
        </Stat>
        <Stat icon={Receipt} label="Paid orders">
          {s.paidOrders}
        </Stat>
        <Stat icon={Ticket} label="Tickets issued" hint="Valid and used">
          {s.ticketsIssued}
        </Stat>
        <Stat icon={CalendarDays} label="Events" hint={`${s.publishedEvents} on sale`}>
          {s.events}
        </Stat>
        <Stat icon={CalendarCheck} label="Events to review" hint="Waiting for a decision">
          {s.pendingEvents}
        </Stat>
        <Stat icon={Users} label="Accounts">
          {s.users}
        </Stat>
      </div>

      <p className="text-xs text-muted">These numbers refresh by themselves every minute.</p>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/admin/AdminOverview.tsx
// ==========================================