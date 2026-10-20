// ==========================================
// FILE: backend/src/modules/users/users.routes.ts
// PURPOSE: Handles fetching the logged-in user's profile.
// ==========================================
import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { prisma } from "../../config/database";
import { ApiError } from "../../utils/ApiError";

const router = Router();

router.get("/me", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw ApiError.unauthorized();
    
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { id: true, email: true, fullName: true, phone: true, role: true, createdAt: true }
    });

    if (!user) throw ApiError.notFound("User not found");
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

export default router;
// ==========================================
// END OF FILE: backend/src/modules/users/users.routes.ts
// LOCATION: backend/src/modules/users/users.routes.ts
// LAST UPDATED: October 19, 2026
// ==========================================