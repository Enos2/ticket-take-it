// ==========================================
// FILE: frontend/src/pages/seller/DoorTeam.tsx
// PURPOSE: An organiser's door team: add people by email so they can scan tickets, and remove them.
// ==========================================
import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import { Field } from "../../components/ui/Field";
import { errorMessage } from "../../lib/api";
import { doorApi } from "../../lib/doorTypes";
import { useTitle } from "../../lib/useTitle";

export default function DoorTeam() {
  useTitle("Door team");

  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const team = useQuery({ queryKey: ["door-team"], queryFn: doorApi.team });

  // ---- add ----
  const add = useMutation({
    mutationFn: () => doorApi.addMember(email.trim()),
    onSuccess: () => {
      setEmail("");
      setError(null);
      void qc.invalidateQueries({ queryKey: ["door-team"] });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  // ---- remove ----
  const remove = useMutation({
    mutationFn: (id: string) => doorApi.removeMember(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["door-team"] }),
    onError: (err) => setError(errorMessage(err)),
  });

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());

  function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!emailOk) return;
    setError(null);
    add.mutate();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-fg">Door team</h1>
        <p className="mt-1 text-sm text-muted">
          People on your door team can scan tickets at your events. They need a Ticket Take It account. Assign them to gates from
          each event's Door tab.
        </p>
      </div>

      <Card className="p-6">
        <form onSubmit={onAdd} className="space-y-5" noValidate>
          {error ? <Alert>{error}</Alert> : null}
          <Field
            label="Email address"
            type="email"
            autoComplete="off"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={email && !emailOk ? "Enter a valid email address" : undefined}
          />
          <Button type="submit" loading={add.isPending} disabled={!emailOk}>
            Add to door team
          </Button>
        </form>
      </Card>

      {/* the team */}
      {team.isLoading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : !team.data || team.data.length === 0 ? (
        <p className="text-sm text-muted">No one is on your door team yet.</p>
      ) : (
        <Card className="divide-y divide-fg/10">
          {team.data.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm text-fg">{m.name ?? m.email}</p>
                {m.name ? <p className="text-xs text-muted">{m.email}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => remove.mutate(m.id)}
                disabled={remove.isPending}
                aria-label={`Remove ${m.email}`}
                className="rounded-md p-2 text-muted hover:text-brand"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/seller/DoorTeam.tsx
// ==========================================