// ==========================================
// FILE: backend/src/modules/orders/orders.schema.ts
// PURPOSE: Defines what the user sends when purchasing tickets.
// ==========================================
import { z } from "zod";

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        ticketTypeId: z.string().min(1),
        quantity: z.number().int().positive().max(100),
      })
    )
    .min(1, "Order must contain at least one ticket")
    .max(10, "An order can contain at most 10 ticket lines"),
});

export const orderIdParamSchema = z.object({
  orderId: z.string().min(1).max(64),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
// ==========================================
// END OF FILE: backend/src/modules/orders/orders.schema.ts
// ==========================================