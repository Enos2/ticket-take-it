// ==========================================
// FILE: frontend/src/pages/seller/EventAttendees.tsx
// PURPOSE: Everyone holding a ticket for the event, with search and a CSV download.
// ==========================================
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Download, Search, Users } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import { SelectField } from "../../components/ui/Field";
import { PageSpinner } from "../../components/ui/Spinner";
import { api, errorMessage } from "../../lib/api";
import { downloadCsv, toCsv } from "../../lib/csv";
import { formatDateTime } from "../../lib/format";
import { ATTENDEE_STATUS_LABEL } from "../../lib/seller";
import { useManagedEvent } from "../../lib/useManagedEvent";
import { useTitle } from "../../lib/useTitle";
import type { Attendee, TicketStatus } from "../../lib/types";

const PAGE_SIZE = 50;

export default function EventAttendees() {
  const { event } = useManagedEvent();
  useTitle(`${event.title} · Attendees`);

  const [status, setStatus] = useState<"" | TicketStatus>("");
  const [search, setSearch] = useState("");

  const query = useInfiniteQuery({
    queryKey: ["seller-attendees", event.id, status],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.list<Attendee>(`/sellers/events/${event.id}/attendees?page=${pageParam}&limit=${PAGE_SIZE}${status ? `&status=${status}` : ""}`),
    getNextPageParam: (last) => (last.meta.page * last.meta.limit < last.meta.total ? last.meta.page + 1 : undefined),
  });

  const loaded = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages[0]?.meta.total ?? 0;

  const needle = search.trim().toLowerCase();
  const shown = needle
    ? loaded.filter(
        (a) =>
          a.user.fullName.toLowerCase().includes(needle) ||
          a.user.email.toLowerCase().includes(needle) ||
          a.order.reference.toLowerCase().includes(needle)
      )
    : loaded;

  function download() {
    const csv = toCsv(
      ["Name", "Email", "Ticket", "Order", "Status", "Checked in at"],
      shown.map((a) => [
        a.user.fullName,
        a.user.email,
        a.ticketType.name,
        a.order.reference,
        ATTENDEE_STATUS_LABEL[a.status],
        a.usedAt ? formatDateTime(a.usedAt) : "",
      ])
    );
    downloadCsv(`${event.slug}-attendees.csv`, csv);
  }

  return (
    <div>
      <div className="mb-6 grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <div>
          <label htmlFor="attendee-search" className="mb-1.5 block text-sm font-medium text-fg">
            Search
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              id="attendee-search"
              type="search"
              placeholder="Name, email or order"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 w-full rounded-lg border border-line bg-ink pr-3.5 pl-10 text-sm text-fg placeholder:text-muted/70 focus:border-gold focus:outline-none"
            />
          </div>
        </div>

        <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value as "" | TicketStatus)}>
          <option value="">All</option>
          <option value="VALID">Not yet arrived</option>
          <option value="USED">Checked in</option>
          <option value="VOID">Cancelled</option>
        </SelectField>

        <Button
          variant="secondary"
          icon={<Download className="size-4" aria-hidden="true" />}
          disabled={shown.length === 0}
          onClick={download}
        >
          Download CSV
        </Button>
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
      ) : loaded.length === 0 ? (
        <EmptyState
          icon={<Users className="size-6" aria-hidden="true" />}
          title={status ? "No attendees match this filter" : "No attendees yet"}
          text={status ? undefined : "People appear here as soon as they buy tickets."}
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">
            Showing {shown.length} of {total} {total === 1 ? "ticket" : "tickets"}
            {query.hasNextPage ? ". Load everyone before you download the CSV." : "."}
          </p>

          <Card className="overflow-x-auto">
            <table className="w-full min-w-160 text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs tracking-wide text-muted uppercase">
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-5 py-3 font-semibold">Ticket</th>
                  <th className="px-5 py-3 font-semibold">Order</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => (
                  <tr key={a.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3">
                      <span className="block font-medium text-fg">{a.user.fullName}</span>
                      <span className="block text-xs text-muted">{a.user.email}</span>
                    </td>
                    <td className="px-5 py-3 text-muted">{a.ticketType.name}</td>
                    <td className="px-5 py-3 text-xs text-muted">{a.order.reference}</td>
                    <td className="px-5 py-3">
                      <Badge tone={a.status === "USED" ? "ok" : a.status === "VOID" ? "brand" : "neutral"}>
                        {ATTENDEE_STATUS_LABEL[a.status]}
                      </Badge>
                      {a.usedAt ? <span className="mt-1 block text-xs text-muted">{formatDateTime(a.usedAt)}</span> : null}
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
// END OF FILE: frontend/src/pages/seller/EventAttendees.tsx
// ==========================================