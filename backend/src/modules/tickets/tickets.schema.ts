// ==========================================
// FILE: backend/src/modules/tickets/tickets.schema.ts
// PURPOSE: Defines validation rules for creating and editing ticket types.
// ==========================================
import { z } from "zod";

const MAX_QUANTITY = 100_000;
const MAX_PRICE_CENTS = 100_000_000; // 1,000,000.00 in major units

export const eventIdParamSchema = z.object({
  eventId: z.string().min(1).max(64),
});

export const ticketParamsSchema = z.object({
  eventId: z.string().min(1).max(64),
  ticketId: z.string().min(1).max(64),
});

export const createTicketTypeSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(1000).optional(),
    tier: z.enum(["EARLY_BIRD", "REGULAR", "VIP", "GROUP"]),
    priceCents: z.number().int().min(0).max(MAX_PRICE_CENTS), // 0 = free ticket
    currency: z.string().trim().length(3).toUpperCase().default("USD"),
    quantity: z.number().int().positive().max(MAX_QUANTITY),

    // Early Bird window (required when tier is EARLY_BIRD)
    startsAt: z.string().datetime({ offset: true }).optional(),
    endsAt: z.string().datetime({ offset: true }).optional(),

    // Group limits (required when tier is GROUP or isGroup is true)
    isGroup: z.boolean().default(false),
    minGroupSize: z.number().int().min(2).optional(),
    maxGroupSize: z.number().int().min(2).optional(),
  })
  .superRefine((d, ctx) => {
    const isGroup = d.tier === "GROUP" || d.isGroup;

    if (isGroup) {
      if (!d.minGroupSize || !d.maxGroupSize) {
        ctx.addIssue({
          code: "custom",
          path: ["minGroupSize"],
          message: "Group tickets require minGroupSize and maxGroupSize",
        });
      } else {
        if (d.maxGroupSize < d.minGroupSize) {
          ctx.addIssue({
            code: "custom",
            path: ["maxGroupSize"],
            message: "maxGroupSize must be at least minGroupSize",
          });
        }
        if (d.maxGroupSize > d.quantity) {
          ctx.addIssue({
            code: "custom",
            path: ["maxGroupSize"],
            message: "maxGroupSize cannot exceed the ticket quantity",
          });
        }
      }
    }

    if (d.tier === "EARLY_BIRD") {
      if (!d.startsAt || !d.endsAt) {
        ctx.addIssue({
          code: "custom",
          path: ["startsAt"],
          message: "Early Bird tickets require startsAt and endsAt",
        });
      } else if (new Date(d.endsAt) <= new Date(d.startsAt)) {
        ctx.addIssue({
          code: "custom",
          path: ["endsAt"],
          message: "endsAt must be after startsAt",
        });
      }
    }
  })
  .transform((d) => {
    // orders.service.ts enforces group limits only when isGroup is true, and
    // date windows only for EARLY_BIRD. Normalise so the stored row always matches.
    const isGroup = d.tier === "GROUP" || d.isGroup;
    const isEarlyBird = d.tier === "EARLY_BIRD";

    return {
      ...d,
      isGroup,
      minGroupSize: isGroup ? d.minGroupSize : undefined,
      maxGroupSize: isGroup ? d.maxGroupSize : undefined,
      startsAt: isEarlyBird ? d.startsAt : undefined,
      endsAt: isEarlyBird ? d.endsAt : undefined,
    };
  });

// tier, currency and isGroup cannot change after creation. Delete and recreate instead.
export const updateTicketTypeSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(1000).nullable(),
    priceCents: z.number().int().min(0).max(MAX_PRICE_CENTS),
    quantity: z.number().int().positive().max(MAX_QUANTITY),
    isActive: z.boolean(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    minGroupSize: z.number().int().min(2),
    maxGroupSize: z.number().int().min(2),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: "Provide at least one field to update" });

export type CreateTicketTypeInput = z.infer<typeof createTicketTypeSchema>;
export type UpdateTicketTypeInput = z.infer<typeof updateTicketTypeSchema>;
// ==========================================
// END OF FILE: backend/src/modules/tickets/tickets.schema.ts
// ==========================================