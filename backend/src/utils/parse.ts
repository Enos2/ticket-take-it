// ==========================================
// FILE: backend/src/utils/parse.ts
// PURPOSE: Shared zod parsing helper that throws a 400 ApiError.
// ==========================================
import { z, ZodTypeAny } from "zod";
import { ApiError } from "./ApiError";

export function parse<T extends ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues
      .map((i) => `${i.path.map(String).join(".") || "input"}: ${i.message}`)
      .join("; ");
    throw ApiError.badRequest(message);
  }
  return result.data;
}
// ==========================================
// END OF FILE: backend/src/utils/parse.ts
// ==========================================