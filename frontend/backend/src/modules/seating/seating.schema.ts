// ==========================================
// FILE: backend/src/modules/seating/seating.schema.ts
// PURPOSE: Validates seat layouts, blocking seats and giving seats to guests.
// ==========================================
import { z } from "zod";

export const MAX_SEATS_PER_EVENT = 10_000;

export const seatingEventParamSchema = z.object({
  eventId: z.string().min(1).max(64),
});

const sectionSchema = z.object({
  name: z.string().trim().min(1).max(40),
  ticketTypeId: z.string().min(1).max(64),
  rows: z.number().int().min(1).max(60),
  seatsPerRow: z.number().int().min(1).max(100),
});

// The whole layout is saved at once. It replaces the previous one.
export const saveLayoutSchema = z
  .object({
    sections: z.array(sectionSchema).min(1).max(30),
  })
  .superRefine((d, ctx) => {
    const names = new Set<string>();
    for (const [index, section] of d.sections.entries()) {
      const key = section.name.toLowerCase();
      if (names.has(key)) {
        ctx.addIssue({ code: "custom", path: ["sections", index, "name"], message: "Two sections cannot have the same name" });
      }
      names.add(key);
    }

    const total = d.sections.reduce((sum, s) => sum + s.rows * s.seatsPerRow, 0);
    if (total > MAX_SEATS_PER_EVENT) {
      ctx.addIssue({ code: "custom", path: ["sections"], message: `An event can have at most ${MAX_SEATS_PER_EVENT} seats` });
    }
  });

export const blockSeatsSchema = z.object({
  seatIds: z.array(z.string().min(1).max(64)).min(1).max(200),
  blocked: z.boolean(), // true keeps the seats off public sale, false puts them back
});

export const giveSeatsSchema = z.object({
  seatIds: z.array(z.string().min(1).max(64)).min(1).max(50),
  recipientEmail: z.string().trim().toLowerCase().email().max(254),
  note: z.string().trim().max(200).optional(),
});

export type SaveLayoutInput = z.infer<typeof saveLayoutSchema>;
export type BlockSeatsInput = z.infer<typeof blockSeatsSchema>;
export type GiveSeatsInput = z.infer<typeof giveSeatsSchema>;
// ==========================================
// END OF FILE: backend/src/modules/seating/seating.schema.ts
// ==========================================