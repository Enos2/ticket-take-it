// ==========================================
// FILE: frontend/src/pages/user/LiveAttendance.tsx
// PURPOSE: Live door numbers for one event: people checked in, the count at each gate and the latest scans.
// ==========================================
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Card from "../../components/ui/Card";
import { errorMessage } from "../../lib/api";
import { doorApi, NO_GATE_LABEL } from "../../lib/doorTypes";
import { useTitle } from "../../lib/useTitle";

export default function LiveAttendance() {
  useTitle("Live attendance");

  const { eventId = "" } = useParams();

  // Refresh every few seconds so the numbers follow the door.
  const live = useQuery({
    queryKey: ["door-live", eventId],
    queryFn: () => doorApi.live(eventId),
    refetchInterval: 5000,
    enabled: !!eventId,
  });

  if (live.isLoading) return <p className="p-6 text-sm text-muted">Loading...</p>;
  if (live.isError || !live.data) return <div className="mx-auto max-w-md p-4"><Alert>{errorMessage(live.error)}</Alert></div>;

  const d = live.data;
  const percent = d.total > 0 ? Math.round((d.checkedIn / d.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-md space-y-6 p-4">
      <Link to="/scan" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" />
        Back to the scanner
      </Link>

      <div>
        <h1 className="text-xl font-bold text-fg">{d.eventTitle}</h1>
        <p className="mt-1 text-xs text-muted">Updates every few seconds.</p>
      </div>

      {/* total */}
      <Card className="p-5">
        <div className="flex items-end justify-between">
          <span className="text-4xl font-bold text-fg">{d.checkedIn}</span>
          <span className="text-sm text-muted">
            of {d.total} tickets ({percent}%)
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-fg/10">
          <div className="h-full bg-brand" style={{ width: `${percent}%` }} />
        </div>
      </Card>

      {/* per gate */}
      {d.byGate.length > 0 ? (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">By gate</h2>
          <Card className="divide-y divide-fg/10">
            {d.byGate.map((g) => (
              <div key={g.gate ?? "none"} className="flex justify-between px-4 py-3 text-sm">
                <span className="text-fg">{g.gate ?? NO_GATE_LABEL}</span>
                <span className="font-semibold text-fg">{g.count}</span>
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      {/* latest scans */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Latest check-ins</h2>
        {d.recent.length === 0 ? (
          <p className="text-sm text-muted">No one has checked in yet.</p>
        ) : (
          <Card className="divide-y divide-fg/10">
            {d.recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm text-fg">{r.holderName}</p>
                  <p className="text-xs text-muted">
                    {r.tierName}
                    {r.gate ? ` - ${r.gate}` : ""}
                  </p>
                </div>
                <span className="text-xs text-muted">{new Date(r.checkedInAt).toLocaleTimeString()}</span>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/user/LiveAttendance.tsx
// ==========================================