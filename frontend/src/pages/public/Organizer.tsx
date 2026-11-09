// ==========================================
// FILE: frontend/src/pages/public/Organizer.tsx
// PURPOSE: An organiser's public page: who they are, a follow button, and their upcoming events.
// ==========================================
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { CalendarCheck, CalendarDays, Store, Users } from "lucide-react";
import EventGrid from "../../components/EventGrid";
import FollowButton from "../../components/FollowButton";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { buttonClasses } from "../../components/ui/styles";
import Alert from "../../components/ui/Alert";
import { ApiRequestError, api, errorMessage } from "../../lib/api";
import type { Organizer as OrganizerData } from "../../lib/engagementTypes";
import type { EventSummary } from "../../lib/types";
import { useTitle } from "../../lib/useTitle";

const PAGE_SIZE = 12;

function Stat({ icon: Icon, value, label }: { icon: typeof Users; value: number; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <Icon className="size-4 text-gold" aria-hidden="true" />
      <span className="font-semibold text-fg tabular-nums">{value}</span> {label}
    </div>
  );
}

export default function Organizer() {
  const { id } = useParams<{ id: string }>();

  const organizer = useQuery({
    queryKey: ["organizer", id],
    queryFn: () => api.get<OrganizerData>(`/organizers/${id}`),
    enabled: Boolean(id),
  });

  const events = useInfiniteQuery({
    queryKey: ["events", "organizer", id],
    initialPageParam: 1,
    enabled: Boolean(id),
    queryFn: ({ pageParam }) => api.list<EventSummary>(`/events?sellerId=${id}&page=${pageParam}&limit=${PAGE_SIZE}`),
    getNextPageParam: (last) => (last.meta.page * last.meta.limit < last.meta.total ? last.meta.page + 1 : undefined),
  });

  const org = organizer.data;
  useTitle(org?.businessName);

  if (organizer.isPending) return <PageSpinner />;

  if (organizer.isError || !org) {
    const notFound = organizer.error instanceof ApiRequestError && organizer.error.status === 404;
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        {notFound ? (
          <EmptyState
            icon={<Store className="size-6" aria-hidden="true" />}
            title="Organizer not found"
            text="The page doesn't exist, or this organizer is not active."
            action={
              <Link to="/events" className={buttonClasses("secondary")}>
                Browse events
              </Link>
            }
          />
        ) : (
          <Alert>{errorMessage(organizer.error)}</Alert>
        )}
      </div>
    );
  }

  const list = events.data?.pages.flatMap((page) => page.items) ?? [];
  const year = new Date(org.memberSince).getFullYear();

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <Card className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <p className="text-sm font-semibold tracking-widest text-gold uppercase">Organizer</p>
          <h1 className="mt-1 text-3xl font-extrabold text-fg">{org.businessName}</h1>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            <Stat icon={Users} value={org.followers} label={org.followers === 1 ? "follower" : "followers"} />
            <Stat icon={CalendarDays} value={org.upcomingEvents} label="upcoming" />
            <Stat icon={CalendarCheck} value={org.hostedEvents} label="hosted" />
          </div>
          <p className="mt-3 text-xs text-muted">On Ticket Take It since {year}</p>
        </div>
        <FollowButton sellerId={org.id} name={org.businessName} />
      </Card>

      <h2 className="mt-12 mb-6 text-2xl font-bold text-fg">Upcoming events</h2>

      {events.isSuccess && list.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="size-6" aria-hidden="true" />}
          title="No upcoming events"
          text="Follow this organizer and we will email you when they put a new event on sale."
        />
      ) : (
        <EventGrid events={list} loading={events.isPending} error={events.isError ? events.error : null} onRetry={() => void events.refetch()} />
      )}

      {events.hasNextPage ? (
        <div className="mt-10 flex justify-center">
          <Button variant="secondary" loading={events.isFetchingNextPage} onClick={() => void events.fetchNextPage()}>
            Load more events
          </Button>
        </div>
      ) : null}
    </section>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/public/Organizer.tsx
// ==========================================