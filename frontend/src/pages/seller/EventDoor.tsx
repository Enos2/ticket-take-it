// ==========================================
// FILE: frontend/src/pages/seller/EventDoor.tsx
// PURPOSE: Door setup for one event: name the gates and choose which door staff work the event and where.
// ==========================================
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Trash2, X } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import { Field } from "../../components/ui/Field";
import { errorMessage } from "../../lib/api";
import { doorApi } from "../../lib/doorTypes";
import { useTitle } from "../../lib/useTitle";

const selectClass = "rounded-lg border border-fg/15 bg-transparent px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand";

export default function EventDoor() {
  useTitle("Door");

  const { id = "" } = useParams();
  const qc = useQueryClient();
  const key = ["event-door", id];

  const config = useQuery({ queryKey: key, queryFn: () => doorApi.eventDoor(id), enabled: !!id });
  const team = useQuery({ queryKey: ["door-team"], queryFn: doorApi.team });

  const [gates, setGates] = useState<string[]>([]);
  const [newGate, setNewGate] = useState("");
  const [staffId, setStaffId] = useState("");
  const [staffGate, setStaffGate] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Start the editable gate list from what the server has.
  useEffect(() => {
    if (config.data) setGates(config.data.gates);
  }, [config.data]);

  const refresh = () => void qc.invalidateQueries({ queryKey: key });
  const fail = (err: unknown) => setError(errorMessage(err));

  // ---- gates ----
  const saveGates = useMutation({
    mutationFn: () => doorApi.saveGates(id, gates),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: fail,
  });

  // ---- staff ----
  const assign = useMutation({
    mutationFn: () => doorApi.assignStaff(id, staffId, staffGate || null),
    onSuccess: () => {
      setStaffId("");
      setStaffGate("");
      setError(null);
      refresh();
    },
    onError: fail,
  });

  const unassign = useMutation({
    mutationFn: (memberId: string) => doorApi.unassignStaff(id, memberId),
    onSuccess: refresh,
    onError: fail,
  });

  if (config.isLoading) return <p className="text-sm text-muted">Loading...</p>;
  if (config.isError || !config.data) return <Alert>{errorMessage(config.error)}</Alert>;

  const saved = config.data;
  const gatesChanged = JSON.stringify(gates) !== JSON.stringify(saved.gates);

  // Team members not yet working this event.
  const assignedIds = new Set(saved.staff.map((s) => s.id));
  const available = (team.data ?? []).filter((m) => !assignedIds.has(m.id));

  function onAddGate(e: FormEvent) {
    e.preventDefault();
    const name = newGate.trim();
    if (!name || gates.includes(name)) return;
    setGates([...gates, name]);
    setNewGate("");
  }

  return (
    <div className="max-w-2xl space-y-8">
      {error ? <Alert>{error}</Alert> : null}

      {/* gates */}
      <Card className="p-6">
        <h2 className="text-lg font-bold text-fg">Gates</h2>
        <p className="mt-1 text-sm text-muted">Name the entrances. Each scan is recorded against the gate the scanner chooses.</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {gates.length === 0 ? <p className="text-sm text-muted">No gates yet. Scans are recorded without a gate.</p> : null}
          {gates.map((g) => (
            <span key={g} className="inline-flex items-center gap-1 rounded-full border border-fg/15 px-3 py-1 text-sm text-fg">
              {g}
              <button type="button" onClick={() => setGates(gates.filter((x) => x !== g))} aria-label={`Remove ${g}`} className="text-muted hover:text-brand">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>

        <form onSubmit={onAddGate} className="mt-4 flex items-end gap-2" noValidate>
          <div className="flex-1">
            <Field label="New gate" placeholder="Main entrance" value={newGate} maxLength={40} onChange={(e) => setNewGate(e.target.value)} />
          </div>
          <Button type="submit" disabled={!newGate.trim()}>
            Add
          </Button>
        </form>

        {gatesChanged ? (
          <Button className="mt-5" loading={saveGates.isPending} onClick={() => saveGates.mutate()}>
            Save gates
          </Button>
        ) : null}
      </Card>

      {/* staff */}
      <Card className="p-6">
        <h2 className="text-lg font-bold text-fg">Door staff at this event</h2>

        {saved.staff.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No one is assigned yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-fg/10">
            {saved.staff.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm text-fg">{s.name ?? s.email}</p>
                  <p className="text-xs text-muted">{s.gate ?? "Any gate"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => unassign.mutate(s.id)}
                  disabled={unassign.isPending}
                  aria-label={`Unassign ${s.email}`}
                  className="rounded-md p-2 text-muted hover:text-brand"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {available.length > 0 ? (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className={`${selectClass} flex-1`}>
              <option value="">Choose a team member</option>
              {available.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name ?? m.email}
                </option>
              ))}
            </select>
            <select value={staffGate} onChange={(e) => setStaffGate(e.target.value)} className={selectClass}>
              <option value="">Any gate</option>
              {saved.gates.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <Button loading={assign.isPending} disabled={!staffId} onClick={() => assign.mutate()}>
              Assign
            </Button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">
            {team.data && team.data.length > 0 ? "Everyone on your door team is assigned." : "Your door team is empty."}{" "}
            <Link to="/seller/door" className="font-medium text-brand hover:underline">
              Manage door team
            </Link>
          </p>
        )}
      </Card>

      <Link to={`/scan/${id}/live`} className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline">
        <Activity className="h-4 w-4" />
        See live attendance
      </Link>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/seller/EventDoor.tsx
// ==========================================