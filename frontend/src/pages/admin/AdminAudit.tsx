// ==========================================
// FILE: frontend/src/pages/admin/AdminAudit.tsx
// PURPOSE: The audit log: who did what, and when.
// ==========================================
import { useState } from "react";
import { ScrollText } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import { SelectField } from "../../components/ui/Field";
import SearchInput from "../../components/ui/SearchInput";
import { PageSpinner } from "../../components/ui/Spinner";
import { errorMessage } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import type { AuditRow } from "../../lib/systemTypes";
import { useAdminList } from "../../lib/useAdminList";
import { useDebouncedValue } from "../../lib/useDebounce";
import { useTitle } from "../../lib/useTitle";

const GROUPS = [
  { label: "Everything", value: "" },
  { label: "Events", value: "event." },
  { label: "Sellers", value: "seller." },
  { label: "Accounts", value: "user." },
  { label: "Orders and refunds", value: "order." },
  { label: "Payments", value: "payment." },
  { label: "Payouts", value: "payout." },
  { label: "Emails", value: "email." },
];

export default function AdminAudit() {
  useTitle("Audit log");

  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const q = useDebouncedValue(search.trim());

  const { query, items, total } = useAdminList<AuditRow>("admin-audit", "/system/audit", { q, action: group }, 25);

  return (
    <div>
      <div className="mb-6 grid gap-4 md:grid-cols-[1fr_16rem] md:items-end">
        <SearchInput label="Search" value={search} onChange={setSearch} placeholder="What happened, who did it, or an id" />
        <SelectField label="Show" value={group} onChange={(e) => setGroup(e.target.value)}>
          {GROUPS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </SelectField>
      </div>

      {query.isPending ? (
        <PageSpinner />
      ) : query.isError ? (
        <div className="space-y-4">
          <Alert>{errorMessage(query.error)}</Alert>
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="size-6" aria-hidden="true" />}
          title="Nothing recorded"
          text={q || group ? "Try a different search." : "Every change an admin makes is recorded here, and the record can't be edited."}
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">
            {total} {total === 1 ? "entry" : "entries"}, newest first.
          </p>

          <Card className="overflow-x-auto">
            <table className="w-full min-w-184 text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs tracking-wide text-muted uppercase">
                  <th className="px-5 py-3 font-semibold">When</th>
                  <th className="px-5 py-3 font-semibold">Who</th>
                  <th className="px-5 py-3 font-semibold">What</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-line align-top last:border-0">
                    <td className="px-5 py-3 whitespace-nowrap text-muted">{formatDateTime(row.createdAt)}</td>
                    <td className="px-5 py-3">
                      <span className="block text-fg">{row.actorEmail ?? "System"}</span>
                      <span className="block text-xs text-muted">
                        {row.actorRole ?? ""}
                        {row.ip ? ` · ${row.ip}` : ""}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="block text-fg">{row.summary}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge>{row.action}</Badge>
                        {row.targetId ? <span className="text-xs break-all text-muted">{row.targetId}</span> : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {query.hasNextPage ? (
            <div className="mt-6 flex justify-center">
              <Button variant="secondary" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                Load more
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/admin/AdminAudit.tsx
// ==========================================