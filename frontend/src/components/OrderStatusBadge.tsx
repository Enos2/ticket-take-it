// ==========================================
// FILE: frontend/src/components/OrderStatusBadge.tsx
// PURPOSE: A coloured label for an order's status.
// ==========================================
import { ORDER_STATUS_LABEL, orderStatusTone } from "../lib/orders";
import type { OrderStatus } from "../lib/types";
import Badge from "./ui/Badge";

export default function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={orderStatusTone(status)}>{ORDER_STATUS_LABEL[status]}</Badge>;
}
// ==========================================
// END OF FILE: frontend/src/components/OrderStatusBadge.tsx
// ==========================================