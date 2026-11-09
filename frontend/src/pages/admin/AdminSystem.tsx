// ==========================================
// FILE: frontend/src/pages/admin/AdminSystem.tsx
// PURPOSE: Is everything running? Database, background jobs, the email queue and which services are on.
// ==========================================
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import { PageSpinner } from "../../components/ui/Spinner";
import { api, errorMessage } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import type { SystemHealth } from "../../lib/systemTypes";
import { useTitle } from "../../lib/useTitle";

const JOB_NAME: Record<string, string> = {
  releaseExpiredOrders: "Release unpaid reservations",
  reconcilePayments: "Check pending payments",
  reconcileLedger: "Post sales to the ledger",
  processEmailOutbox: "Retry failed emails",
  sendEventReminders: "Send event reminders",
  cleanupExpiredTokens: "Clear expired sign-in links",
};

function ago(iso: string | null): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86_400)} d ago`;
}

function uptime(seconds: number): string {
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h`;
  return `${Math.floor(seconds / 86_400)} d`;
}

function Status({ ok, children }: { ok: boolean; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {ok ? <CheckCircle2 className="size-4 text-ok" aria-hidden="true" /> : <XCircle className="size-4 text-brand" aria-hidden="true" />}
      <span className={ok ? "text-fg" : "text-brand"}>{children}</span>
    </span>
  );
}

export default function AdminSystem() {
  useTitle("System");
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const health = useQuery({
    queryKey: ["admin-system"],
    queryFn: () => api.get<SystemHealth>("/system/health"),
    refetchInterval: 30_000,
  });

  const retry = useMutation({
    mutationFn: (id: string) => api.post(`/system/emails/${id}/retry`),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-system"] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (health.isPending) return <PageSpinner />;

  if (health.isError) {
    return (
      <div className="space-y-4">
        <Alert>{errorMessage(health.error)}</Alert>
        <Button variant="secondary" onClick={() => void health.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const h = health.data;
  const stuck = h.jobs.filter((j) => j.stale);
  const email = h.email;
  const production = h.server.environment === "production";

  return (
    <div className="space-y-8">
      {!h.database.ok ? (
        <Alert>The database is not answering. Nothing can be saved until it is back.</Alert>
      ) : stuck.length > 0 ? (
        <Alert>
          {stuck.length === 1 ? "A background job looks stuck" : `${stuck.length} background jobs look stuck`}:{" "}
          {stuck.map((j) => JOB_NAME[j.name] ?? j.name).join(", ")}. Restarting the server usually fixes it.
        </Alert>
      ) : (
        <Alert variant="success">Everything looks healthy.</Alert>
      )}

      {error ? <Alert>{error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-sm text-muted">Database</p>
          <p className="mt-2 text-lg font-bold">
            <Status ok={h.database.ok}>{h.database.ok ? "Connected" : "Down"}</Status>
          </p>
          <p className="mt-1 text-xs text-muted">{h.database.latencyMs} ms to answer</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted">Server</p>
          <p className="mt-2 text-lg font-bold text-fg">Up for {uptime(h.server.uptimeSeconds)}</p>
          <p className="mt-1 text-xs text-muted">
            {h.server.environment}, Node {h.server.nodeVersion}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted">Email queue</p>
          <p className="mt-2 text-lg font-bold text-fg tabular-nums">{email ? `${email.pending} waiting` : "Unknown"}</p>
          <p className="mt-1 text-xs text-muted">
            {email ? `${email.sent24h} sent in 24 h, ${email.failed7d} failed in 7 days` : "Could not be read"}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted">Services</p>
          <ul className="mt-2 space-y-1 text-sm">
            <li><Status ok={h.services.paystack}>{`Paystack ${h.services.paystack ? "on" : "off"}`}</Status></li>
            <li><Status ok={h.services.mpesa}>{`M-Pesa ${h.services.mpesa ? "on" : "off"}`}</Status></li>
            <li><Status ok={h.services.email}>{`Email ${h.services.email ? "on" : "off"}`}</Status></li>
            <li><Status ok={h.services.monitoring}>{`Error alerts ${h.services.monitoring ? "on" : "off"}`}</Status></li>
          </ul>
        </Card>
      </div>

      {production && (!h.services.email || !h.services.monitoring) ? (
        <Alert variant="info">
          {!h.services.email ? "Email is off, so nobody receives tickets or password links. " : ""}
          {!h.services.monitoring ? "Error alerts are off, so crashes only appear in the server logs." : ""}
        </Alert>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-widest text-gold uppercase">Background jobs</h2>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-160 text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs tracking-wide text-muted uppercase">
                <th className="px-5 py-3 font-semibold">Job</th>
                <th className="px-5 py-3 font-semibold">Last run</th>
                <th className="px-5 py-3 text-right font-semibold">Took</th>
                <th className="px-5 py-3 text-right font-semibold">Runs</th>
                <th className="px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {h.jobs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-muted">
                    No jobs reported. The jobs run inside the server process, so this stays empty while you only run tests.
                  </td>
                </tr>
              ) : (
                h.jobs.map((j) => (
                  <tr key={j.name} className="border-b border-line align-top last:border-0">
                    <td className="px-5 py-3 font-medium text-fg">{JOB_NAME[j.name] ?? j.name}</td>
                    <td className="px-5 py-3 text-muted">{ago(j.lastFinishedAt)}</td>
                    <td className="px-5 py-3 text-right text-muted tabular-nums">{j.lastDurationMs === null ? "-" : `${j.lastDurationMs} ms`}</td>
                    <td className="px-5 py-3 text-right text-muted tabular-nums">
                      {j.runs}
                      {j.failures > 0 ? <span className="block text-xs text-brand">{j.failures} failed</span> : null}
                    </td>
                    <td className="px-5 py-3">
                      {j.lastError ? (
                        <>
                          <Badge tone="brand">Last run failed</Badge>
                          <span className="mt-1 block text-xs text-muted">{j.lastError}</span>
                        </>
                      ) : j.stale ? (
                        <Badge tone="brand">Looks stuck</Badge>
                      ) : j.running ? (
                        <Badge tone="gold">Running</Badge>
                      ) : (
                        <Badge tone="ok">Healthy</Badge>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-widest text-gold uppercase">Emails that could not be sent</h2>
        {!email || email.recentFailures.length === 0 ? (
          <Card className="p-6 text-sm text-muted">None. Failed emails are retried by themselves 5 times over about 9 hours before they land here.</Card>
        ) : (
          <ul className="space-y-3">
            {email.recentFailures.map((f) => (
              <li key={f.id}>
                <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-fg">{f.subject}</p>
                    <p className="text-sm text-muted">
                      To {f.toEmail} · {f.attempts} {f.attempts === 1 ? "attempt" : "attempts"} · {formatDateTime(f.createdAt)}
                    </p>
                    {f.lastError ? <p className="mt-1 text-xs text-brand">{f.lastError}</p> : null}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={retry.isPending && retry.variables === f.id}
                    disabled={retry.isPending}
                    onClick={() => retry.mutate(f.id)}
                  >
                    Try again
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted">This page refreshes by itself every 30 seconds.</p>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/admin/AdminSystem.tsx
// ==========================================