// ==========================================
// FILE: frontend/src/pages/user/Scan.tsx
// PURPOSE: The scanner for anyone on a door team (and organisers): pick an event and gate, then scan tickets.
// ==========================================
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Card from "../../components/ui/Card";
import ScannerPanel from "../../components/ScannerPanel";
import { errorMessage } from "../../lib/api";
import { doorApi } from "../../lib/doorTypes";
import { useTitle } from "../../lib/useTitle";

const selectClass = "mt-1 w-full rounded-lg border border-fg/15 bg-transparent px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand";

export default function Scan() {
  useTitle("Scan tickets");

  const events = useQuery({ queryKey: ["door-events"], queryFn: doorApi.events });
  const [eventId, setEventId] = useState("");
  const [gate, setGate] = useState("");

  const list = events.data ?? [];
  const event = list.find((e) => e.id === eventId);

  // Start on the first event.
  useEffect(() => {
    if (!eventId && list.length > 0) setEventId(list[0].id);
  }, [list, eventId]);

  // Start on the first gate of whichever event is chosen.
  useEffect(() => {
    setGate(event?.gates[0] ?? "");
  }, [event?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (events.isLoading) return <p className="p-6 text-sm text-muted">Loading...</p>;
  if (events.isError) return <div className="mx-auto max-w-md p-4"><Alert>{errorMessage(events.error)}</Alert></div>;

  if (list.length === 0) {
    return (
      <div className="mx-auto max-w-md p-4">
        <Card className="p-6 text-center">
          <h1 className="text-lg font-bold text-fg">Scan tickets</h1>
          <p className="mt-2 text-sm text-muted">
            You aren't on a door team yet. Ask the organiser to add your email address, then reload this page.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-5 p-4">
      <h1 className="text-xl font-bold text-fg">Scan tickets</h1>

      <Card className="space-y-4 p-4">
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Event
          <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={selectClass}>
            {list.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </select>
        </label>

        {/* Only events with named gates ask which gate this phone is at */}
        {event && event.gates.length > 0 ? (
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
            Gate
            <select value={gate} onChange={(e) => setGate(e.target.value)} className={selectClass}>
              {event.gates.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </Card>

      {/* key restarts the scanner cleanly when the event changes */}
      {eventId ? <ScannerPanel key={eventId} eventId={eventId} gate={gate || null} /> : null}

      {eventId ? (
        <Link to={`/scan/${eventId}/live`} className="flex items-center justify-center gap-2 text-sm font-medium text-brand hover:underline">
          <Activity className="h-4 w-4" />
          See live attendance
        </Link>
      ) : null}
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/user/Scan.tsx
// ==========================================