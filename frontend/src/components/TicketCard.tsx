// ==========================================
// FILE: frontend/src/components/TicketCard.tsx
// PURPOSE: One ticket with its QR code, shown to the person who bought it.
// ==========================================
import { QRCodeSVG } from "qrcode.react";
import { CalendarDays, MapPin } from "lucide-react";
import { cx } from "../lib/cx";
import { formatDateTime } from "../lib/format";
import { TICKET_STATUS_LABEL } from "../lib/orders";
import type { TicketStatus } from "../lib/types";
import Badge from "./ui/Badge";
import Card from "./ui/Card";

interface TicketCardProps {
  ticketId: string;
  code: string; // the secret that goes in the QR code
  status: TicketStatus;
  ticketName: string;
  eventTitle: string;
  startsAt?: string;
  venue?: string;
  orderReference?: string;
  usedAt?: string | null;
}

export default function TicketCard({
  ticketId,
  code,
  status,
  ticketName,
  eventTitle,
  startsAt,
  venue,
  orderReference,
  usedAt,
}: TicketCardProps) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        <div className="flex-1 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status === "VALID" ? "ok" : "neutral"}>{TICKET_STATUS_LABEL[status]}</Badge>
            <span className="text-xs text-muted">Ticket {ticketId.slice(-6).toUpperCase()}</span>
          </div>

          <h3 className="mt-3 text-lg leading-snug font-bold text-fg">{eventTitle}</h3>
          <p className="text-sm font-medium text-gold">{ticketName}</p>

          <ul className="mt-3 space-y-1.5 text-sm text-muted">
            {startsAt ? (
              <li className="flex items-start gap-2">
                <CalendarDays className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden="true" />
                <span>{formatDateTime(startsAt)}</span>
              </li>
            ) : null}
            {venue ? (
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden="true" />
                <span>{venue}</span>
              </li>
            ) : null}
          </ul>

          {orderReference ? <p className="mt-3 text-xs text-muted">Order {orderReference}</p> : null}
        </div>

        <div className="flex flex-col items-center justify-center gap-2 border-t border-dashed border-line bg-ink p-5 sm:w-60 sm:border-t-0 sm:border-l">
          {status === "VOID" ? (
            <p className="max-w-40 text-center text-sm text-muted">This ticket is no longer valid.</p>
          ) : (
            <>
              {/* QR codes need a light background to scan reliably */}
              <div className={cx("rounded-lg bg-white p-3", status === "USED" && "opacity-30")}>
                <QRCodeSVG value={code} size={148} level="M" bgColor="#ffffff" fgColor="#0b0b0d" />
              </div>
              <p className="text-center text-xs text-muted">
                {status === "USED"
                  ? `Used${usedAt ? ` on ${formatDateTime(usedAt)}` : ""}`
                  : "Show this code at the entrance. It works once."}
              </p>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
// ==========================================
// END OF FILE: frontend/src/components/TicketCard.tsx
// ==========================================