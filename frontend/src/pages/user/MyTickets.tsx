// ==========================================
// FILE: frontend/src/pages/user/MyTickets.tsx
// PURPOSE: All of a person's tickets with QR codes, upcoming events first, with a way to send a ticket to someone else.
// ==========================================
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Ticket } from "lucide-react";
import TicketCard from "../../components/TicketCard";
import TransferControls from "../../components/TransferControls";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import { PageSpinner } from "../../components/ui/Spinner";
import { buttonClasses } from "../../components/ui/styles";
import { api, errorMessage } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { useTitle } from "../../lib/useTitle";
import type { TransferView, TransferableTicket, TransfersOverview } from "../../lib/transfers";
import type { EventBrief } from "../../lib/types";

interface Group {
  event: EventBrief;
  tickets: TransferableTicket[];
}

function groupByEvent(tickets: TransferableTicket[]): Group[] {
  const groups = new Map<string, Group>();
  for (const ticket of tickets) {
    const existing = groups.get(ticket.event.id);
    if (existing) existing.tickets.push(ticket);
    else groups.set(ticket.event.id, { event: ticket.event, tickets: [ticket] });
  }
  return [...groups.values()];
}

function GroupSection({ group, pendingByTicket }: { group: Group; pendingByTicket: Map<string, TransferView> }) {
  const { event } = group;
  return (
    <section>
      <div className="mb-3">
        <h3 className="text-lg font-bold text-fg">
          <Link to={`/events/${event.slug}`} className="hover:text-gold">
            {event.title}
          </Link>
        </h3>
        <p className="text-sm text-muted">
          {formatDateTime(event.startsAt)} · {event.venue}, {event.city}
        </p>
      </div>
      <div className="space-y-4">
        {group.tickets.map((ticket) => (
          <TicketCard
            key={ticket.id}
            ticketId={ticket.id}
            code={ticket.code}
            status={ticket.status}
            ticketName={ticket.ticketType.name}
            eventTitle={event.title}
            startsAt={event.startsAt}
            venue={`${event.venue}, ${event.city}`}
            orderReference={ticket.order.reference}
            usedAt={ticket.usedAt}
            footer={<TransferControls ticket={ticket} pending={pendingByTicket.get(ticket.id)} />}
          />
        ))}
      </div>
    </section>
  );
}

export default function MyTickets() {
  useTitle("My tickets");

  const query = useQuery({
    queryKey: ["my-tickets"],
    queryFn: () => api.get<TransferableTicket[]>("/orders/my-tickets"),
  });

  // Tickets I already sent to someone, so each one can show "waiting for an answer".
  const transfers = useQuery({
    queryKey: ["transfers"],
    queryFn: () => api.get<TransfersOverview>("/transfers"),
  });

  if (query.isPending) return <PageSpinner />;

  if (query.isError) {
    return (
      <div className="space-y-4">
        <Alert>{errorMessage(query.error)}</Alert>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const tickets = query.data;
  const pendingByTicket = new Map<string, TransferView>((transfers.data?.outgoing ?? []).map((t) => [t.ticket.id, t]));
  const waitingForMe = transfers.data?.incoming.length ?? 0;

  if (tickets.length === 0) {
    return (
      <div className="space-y-6">
        {waitingForMe > 0 ? (
          <Alert variant="info">
            Someone sent you {waitingForMe === 1 ? "a ticket" : `${waitingForMe} tickets`}.{" "}
            <Link to="/account/transfers" className="font-semibold underline underline-offset-4">
              See transfers
            </Link>
          </Alert>
        ) : null}
        <EmptyState
          icon={<Ticket className="size-6" aria-hidden="true" />}
          title="No tickets yet"
          text="Once you buy tickets, they appear here with a QR code for the entrance."
          action={
            <Link to="/events" className={buttonClasses("primary")}>
              Browse events
            </Link>
          }
        />
      </div>
    );
  }

  const now = Date.now();
  const isCurrent = (t: TransferableTicket) =>
    t.status !== "VOID" && t.event.status !== "CANCELLED" && new Date(t.event.endsAt).getTime() >= now;

  const upcoming = groupByEvent(tickets.filter(isCurrent)).sort(
    (a, b) => new Date(a.event.startsAt).getTime() - new Date(b.event.startsAt).getTime()
  );
  const past = groupByEvent(tickets.filter((t) => !isCurrent(t))).sort(
    (a, b) => new Date(b.event.startsAt).getTime() - new Date(a.event.startsAt).getTime()
  );

  return (
    <div className="space-y-12">
      {waitingForMe > 0 ? (
        <Alert variant="info">
          Someone sent you {waitingForMe === 1 ? "a ticket" : `${waitingForMe} tickets`}.{" "}
          <Link to="/account/transfers" className="font-semibold underline underline-offset-4">
            See transfers
          </Link>
        </Alert>
      ) : null}

      {upcoming.length > 0 ? (
        <div className="space-y-10">
          <h2 className="text-sm font-semibold tracking-widest text-gold uppercase">Upcoming</h2>
          {upcoming.map((group) => (
            <GroupSection key={group.event.id} group={group} pendingByTicket={pendingByTicket} />
          ))}
        </div>
      ) : null}

      {past.length > 0 ? (
        <div className="space-y-10">
          <h2 className="text-sm font-semibold tracking-widest text-muted uppercase">Past and cancelled</h2>
          {past.map((group) => (
            <GroupSection key={group.event.id} group={group} pendingByTicket={pendingByTicket} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
// ==========================================
// END OF FILE: frontend/src/pages/user/MyTickets.tsx
// ==========================================