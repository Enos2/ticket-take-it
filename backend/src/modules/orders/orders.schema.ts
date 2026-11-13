// ==========================================
// FILE: backend/src/modules/orders/orders.schema.ts
// PURPOSE: Defines what the user sends when purchasing tickets.
// ==========================================
import { z } from "zod";

// Tickets are bought either by quantity (general admission) or by picking seats on the seat map. An order can have both.
export const createOrderSchema = z
  .object({
    items: z
      .array(
        z.object({
          ticketTypeId: z.string().min(1),
          quantity: z.number().int().positive().max(100),
        })
      )
      .max(10, "An order can contain at most 10 ticket lines")
      .default([]),
    seatIds: z.array(z.string().min(1).max(64)).max(20, "You can pick at most 20 seats in one order").default([]),
  })
  .refine((d) => d.items.length + d.seatIds.length > 0, {
    message: "Order must contain at least one ticket",
    path: ["items"],
  });

export const orderIdParamSchema = z.object({
  orderId: z.string().min(1).max(64),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
// ==========================================
// END OF FILE: backend/src/modules/orders/orders.schema.ts
// ==========================================