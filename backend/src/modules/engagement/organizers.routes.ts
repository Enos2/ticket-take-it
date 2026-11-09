// ==========================================
// FILE: backend/src/modules/engagement/organizers.routes.ts
// PURPOSE: The public organiser profile. Anyone can read it.
// ==========================================
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { parse } from "../../utils/parse";
import { getOrganizer } from "./engagement.service";

const router = Router();

const idParam = z.object({ id: z.string().min(1).max(64) });

router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = parse(idParam, req.params);
    res.json({ success: true, data: await getOrganizer(id) });
  } catch (err) {
    next(err);
  }
});

export default router;
// ==========================================
// END OF FILE: backend/src/modules/engagement/organizers.routes.ts
// ==========================================