// ==========================================
// FILE: backend/src/utils/json.ts
// PURPOSE: Safe handling of Prisma JSON columns.
// ==========================================
import { Prisma } from "@prisma/client";

// JSON columns can hold anything. This returns a plain object, or {} if it isn't one.
export function toJsonObject(value: unknown): Prisma.InputJsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Prisma.InputJsonObject) : {};
}
// ==========================================
// END OF FILE: backend/src/utils/json.ts
// ==========================================