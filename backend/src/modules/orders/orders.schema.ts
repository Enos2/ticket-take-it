// ==========================================
// FILE: backend/src/modules/orders/orders.schema.ts
// PURPOSE: Defines what the user sends when purchasing tickets.
// ==========================================
import { z } from "zod";

export const createOrderSchema = z.object({
  items: z.array(
    z.object({
      ticketTypeId: z.string(),
      quantity: z.number().int().positive(),
    })
  ).min(1, "Order must contain at least one ticket"),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
// ==========================================
// END OF FILE: backend/src/modules/orders/orders.schema.ts
// LOCATION: backend/src/modules/orders/orders.schema.ts
// LAST UPDATED: October 19, 2026
// ==========================================