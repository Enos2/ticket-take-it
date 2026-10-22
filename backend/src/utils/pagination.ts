// ==========================================
// FILE: backend/src/utils/pagination.ts
// PURPOSE: Shared pagination query schema and helper.
// ==========================================
import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

export const skipTake = ({ page, limit }: Pagination) => ({ skip: (page - 1) * limit, take: limit });
// ==========================================
// END OF FILE: backend/src/utils/pagination.ts
// ==========================================