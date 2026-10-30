// ==========================================
// FILE: frontend/src/pages/seller/SellerDashboard.tsx
// PURPOSE: The seller's events, with a status filter.
// ==========================================
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronRight, MapPin, Plus } from "lucide-react";
import Alert from "../../components/ui/Alert";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { buttonClasses } from "../../components/ui/styles";
import { api, errorMessage } from "../../lib/api";
import { cx } from "../../lib/cx";
import { formatDateTime } from "../../lib/format";
import { displayStatus } from "../../lib/seller";
import { useTitle } from "../../lib/useTitle";
import type { EventStatus, SellerEventListItem } from "../../lib/types";

const PAGE_SIZE = 12;

const FILTERS: { label: string; value: "" | EventStatus }[] = [
  { label: "All", value: "" },
  { label: "Drafts", value: "DRAFT" },
  { label: "On sale", value: "PUBLISHED" },
  { label: "In review", value: "PENDING_REVIEW" },
  { label: "Needs changes", value: "REJECTED" },
  { label: "Taken down", value: "TAKEN_DOWN" },
  { label: "Cancelled", value: "CANCELLED" },
];

function EventRow({ event }: { event: SellerEventListItem }) {
  const status = displayStatus(event);
  const capacity = event.ticketTypes.reduce((sum, t) => sum + t.quantity, 0);
  const taken = event.ticketTypes.reduce((sum, t) => sum + t.sold, 0);
  const percent = capacity > 0 ? Math.min(100, Math.round((taken / capacity) * 100)) : 0;

  return (
    <li>
      <Link
        to={`/seller/events/${event.id}`}
        className="group flex items-center gap-4 rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-gold/60"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-semibold text-fg">{event.title}</h2>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>

          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
            <li className="flex items-center gap-1.5">
              <CalendarDays className="size-4 text-gold" aria-hidden="true" />
              {formatDateTime(event.startsAt)}
            </li>
            <li className="flex items-center gap-1.5">
              <MapPin className="size-4 text-gold" aria-hidden="true" />
              {event.venue}, {event.city}
            </li>
          </ul>

          {event.ticketTypes.length === 0 ? (
            <p className="mt-3 text-sm text-gold">No tickets yet. Add a ticket type to get started.</p>
          ) : (
            <div className="mt-3 max-w-md">
              <div className="mb-1 flex justify-between text-xs text-muted">
                <span>Tickets sold or held</span>
                <span className="tabular-nums">
                  {taken} of {capacity}
                </span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-ink"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Tickets sold or held"
              >
                <div className="h-full rounded-full bg-gold" style={{ width: `${percent}%` }} />
              </div>
            </div>
          )}
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted transition-colors group-hover:text-gold" aria-hidden="true" />
      </Link>
    </li>
  );
}

export default function SellerDashboard() {
  useTitle("My events");
  const [filter, setFilter] = useState<"" | EventStatus>("");

  const query = useInfiniteQuery({
    queryKey: ["seller-events", filter],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.list<SellerEventListItem>(`/sellers/events?page=${pageParam}&limit=${PAGE_SIZE}${filter ? `&status=${filter}` : ""}`),
    getNextPageParam: (last) => (last.meta.page * last.meta.limit < last.meta.total ? last.meta.page + 1 : undefined),
  });

  const events = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter events">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setFilter(f.value)}
              aria-pressed={filter === f.value}
              className={cx(
                "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                filter === f.value ? "border-gold bg-gold/10 text-gold" : "border-line text-muted hover:text-fg"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <Link to="/seller/events/new" className={buttonClasses("primary")}>
          <Plus className="size-4" aria-hidden="true" />
          Create event
        </Link>
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
      ) : events.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="size-6" aria-hidden="true" />}
          title={filter ? "No events match this filter" : "You haven't created an event yet"}
          text={filter ? undefined : "Create your first event, add tickets, then publish it so people can buy."}
          action={
            filter ? undefined : (
              <Link to="/seller/events/new" className={buttonClasses("primary")}>
                Create your first event
              </Link>
            )
          }
        />
      ) : (
        <>
          <ul className="space-y-3">
            {events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ul>

          {query.hasNextPage ? (
            <div className="mt-8 flex justify-center">
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
// END OF FILE: frontend/src/pages/seller/SellerDashboard.tsx
// ==========================================