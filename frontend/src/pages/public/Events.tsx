// ==========================================
// FILE: frontend/src/pages/public/Events.tsx
// PURPOSE: Every upcoming event, loaded a page at a time.
// ==========================================
import { useInfiniteQuery } from "@tanstack/react-query";
import EventGrid from "../../components/EventGrid";
import Button from "../../components/ui/Button";
import { api } from "../../lib/api";
import { useTitle } from "../../lib/useTitle";
import type { EventSummary } from "../../lib/types";

const PAGE_SIZE = 12;

export default function Events() {
  useTitle("Events");

  const query = useInfiniteQuery({
    queryKey: ["events", "all"],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api.list<EventSummary>(`/events?page=${pageParam}&limit=${PAGE_SIZE}`),
    getNextPageParam: (last) => (last.meta.page * last.meta.limit < last.meta.total ? last.meta.page + 1 : undefined),
  });

  const events = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages[0]?.meta.total ?? 0;

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-fg sm:text-4xl">Upcoming events</h1>
        <p className="mt-2 text-sm text-muted">
          {query.isSuccess && total > 0 ? `${total} ${total === 1 ? "event" : "events"}, soonest first.` : "Sorted by date, soonest first."}
        </p>
      </div>

      <EventGrid
        events={events}
        loading={query.isPending}
        error={query.isError ? query.error : null}
        onRetry={() => void query.refetch()}
      />

      {query.hasNextPage ? (
        <div className="mt-10 flex justify-center">
          <Button variant="secondary" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
            Load more events
          </Button>
        </div>
      ) : null}
    </section>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/public/Events.tsx
// ==========================================