// ==========================================
// FILE: frontend/src/lib/orders.ts
// PURPOSE: Labels and helpers for orders and tickets.
// ==========================================
import type { EventBrief, Order, OrderStatus, TicketStatus } from "./types";

export type Tone = "neutral" | "gold" | "brand" | "ok";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Awaiting payment",
  RESERVED: "Awaiting payment",
  PAID: "Paid",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
  EXPIRED: "Expired",
};

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  VALID: "Valid",
  USED: "Used",
  VOID: "Cancelled",
};

export function orderStatusTone(status: OrderStatus): Tone {
  switch (status) {
    case "PAID":
      return "ok";
    case "PENDING":
    case "RESERVED":
      return "gold";
    case "CANCELLED":
    case "EXPIRED":
    case "REFUNDED":
      return "neutral";
  }
}

export const isUnpaid = (status: OrderStatus) => status === "PENDING" || status === "RESERVED";

// The distinct events an order covers.
export function orderEvents(order: Order): EventBrief[] {
  const seen = new Map<string, EventBrief>();
  for (const item of order.items) {
    const event = item.ticketType.event;
    if (event) seen.set(event.id, event);
  }
  return [...seen.values()];
}

export function orderTitle(order: Order): string {
  const events = orderEvents(order);
  return events.length === 0 ? "Your order" : events.map((e) => e.title).join(", ");
}

// 754 seconds becomes "12:34".
export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
// ==========================================
// END OF FILE: frontend/src/lib/orders.ts
// ==========================================