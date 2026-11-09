// ==========================================
// FILE: frontend/src/pages/user/SavedEvents.tsx
// PURPOSE: The events a person saved, and the organisers they follow.
// ==========================================
import { Heart, Users } from "lucide-react";
import { Link } from "react-router-dom";
import EventGrid from "../../components/EventGrid";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import { buttonClasses } from "../../components/ui/styles";
import FollowButton from "../../components/FollowButton";
import type { FollowedOrganizer } from "../../lib/engagementTypes";
import type { EventSummary } from "../../lib/types";
import { useAdminList } from "../../lib/useAdminList";
import { useTitle } from "../../lib/useTitle";

export default function SavedEvents() {
  useTitle("Saved");

  const saved = useAdminList<EventSummary>("favorites", "/engagement/favorites", {}, 12);
  const following = useAdminList<FollowedOrganizer>("following", "/engagement/follows", {}, 50);

  return (
    <div className="space-y-12">
      <section>
        <h2 className="mb-6 text-sm font-semibold tracking-widest text-gold uppercase">Saved events</h2>

        {saved.query.isSuccess && saved.items.length === 0 ? (
          <EmptyState
            icon={<Heart className="size-6" aria-hidden="true" />}
            title="Nothing saved yet"
            text="Tap the heart on an event to keep it here. Events that have ended or are no longer on sale don't show."
            action={
              <Link to="/events" className={buttonClasses("primary")}>
                Browse events
              </Link>
            }
          />
        ) : (
          <EventGrid
            events={saved.items}
            loading={saved.query.isPending}
            error={saved.query.isError ? saved.query.error : null}
            onRetry={() => void saved.query.refetch()}
            skeletons={3}
          />
        )}

        {saved.query.hasNextPage ? (
          <div className="mt-8 flex justify-center">
            <Button variant="secondary" loading={saved.query.isFetchingNextPage} onClick={() => void saved.query.fetchNextPage()}>
              Load more
            </Button>
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="mb-6 text-sm font-semibold tracking-widest text-gold uppercase">Organizers you follow</h2>

        {following.query.isSuccess && following.items.length === 0 ? (
          <Card className="p-6 text-sm text-muted">
            You don't follow anyone yet. Follow an organizer on their page and we will email you when they put a new event on sale.
          </Card>
        ) : (
          <ul className="space-y-3">
            {following.items.map((o) => (
              <li key={o.id}>
                <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <Users className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden="true" />
                    <div>
                      <Link to={`/organizers/${o.id}`} className="font-semibold text-fg hover:text-gold">
                        {o.businessName}
                      </Link>
                      <p className="text-sm text-muted">
                        {o.upcomingEvents} upcoming {o.upcomingEvents === 1 ? "event" : "events"} · {o.followers}{" "}
                        {o.followers === 1 ? "follower" : "followers"}
                      </p>
                    </div>
                  </div>
                  <FollowButton sellerId={o.id} name={o.businessName} />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/user/SavedEvents.tsx
// ==========================================