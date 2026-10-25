// ==========================================
// FILE: frontend/src/lib/useAdminList.ts
// PURPOSE: Loads an admin list a page at a time, with filters.
// ==========================================
import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "./api";

// `key` names the list so it can be refreshed after a change. Empty filters are left out of the request.
export function useAdminList<T>(key: string, path: string, filters: Record<string, string> = {}, pageSize = 20) {
  const active = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ""));

  const query = useInfiniteQuery({
    queryKey: [key, active],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const search = new URLSearchParams({ ...active, page: String(pageParam), limit: String(pageSize) });
      return api.list<T>(`${path}?${search.toString()}`);
    },
    getNextPageParam: (last) => (last.meta.page * last.meta.limit < last.meta.total ? last.meta.page + 1 : undefined),
  });

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages[0]?.meta.total ?? 0;

  return { query, items, total };
}
// ==========================================
// END OF FILE: frontend/src/lib/useAdminList.ts
// ==========================================