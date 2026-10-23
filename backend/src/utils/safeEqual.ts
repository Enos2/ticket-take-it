// ==========================================
// FILE: backend/src/utils/safeEqual.ts
// PURPOSE: Constant-time string comparison for secrets.
// ==========================================
import { createHash, timingSafeEqual } from "crypto";

// Both values are hashed first so the comparison is constant-time and length-safe.
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
// ==========================================
// END OF FILE: backend/src/utils/safeEqual.ts
// ==========================================