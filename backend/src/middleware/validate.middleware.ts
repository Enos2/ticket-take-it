// ==========================================
// FILE: backend/src/middleware/validate.middleware.ts
// PURPOSE: Zod validation middleware.
// ==========================================
import { Request, Response, NextFunction } from "express";
import { AnyZodObject, ZodError } from "zod";
import { ApiError } from "../utils/ApiError";

export function validate(schema: AnyZodObject, target: "body" | "query" | "params" = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      (req as any)[target] = schema.parse(req[target]);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const msg = err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
        return next(ApiError.badRequest(`Validation failed — ${msg}`));
      }
      next(err);
    }
  };
}
// ==========================================
// END OF FILE: backend/src/middleware/validate.middleware.ts
// LOCATION: backend/src/middleware/validate.middleware.ts
// LAST UPDATED: October 19, 2026
// ==========================================