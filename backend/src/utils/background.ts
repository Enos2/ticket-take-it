// ==========================================
// FILE: backend/src/utils/background.ts
// PURPOSE: Runs a task without making the request wait, and logs failures.
// ==========================================
import { logger } from "./logger";

export function background(task: Promise<unknown>, label: string): void {
  task.catch((err) => logger.error({ err }, `Background task failed: ${label}`));
}
// ==========================================
// END OF FILE: backend/src/utils/background.ts
// ==========================================