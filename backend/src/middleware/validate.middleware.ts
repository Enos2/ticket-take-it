// ==========================================
// FILE: backend/src/middleware/validate.middleware.ts
// PURPOSE: Zod validation middleware.
// ==========================================
import { Request, Response, NextFunction } from "express";
import { ZodTypeAny } from "zod";
import { ApiError } from "../utils/ApiError";

type Target = "body" | "query" | "params";

// Accepts any zod schema, including ones that use .refine() or .transform().
export function validate(schema: ZodTypeAny, target: Target = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const msg = result.error.issues
        .map((i) => `${i.path.map(String).join(".") || "input"}: ${i.message}`)
        .join("; ");
      return next(ApiError.badRequest(`Validation failed - ${msg}`));
    }

    if (target === "query") {
      // Express 5 makes req.query a read-only getter, so plain assignment throws.
      // Defining it on the request instance works on Express 4 and 5.
      Object.defineProperty(req, "query", {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    } else {
      // Replaces the input with the parsed version (trimmed, lowercased, unknown keys stripped).
      req[target] = result.data;
    }

    next();
  };
}
// ==========================================
// END OF FILE: backend/src/middleware/validate.middleware.ts
// ==========================================