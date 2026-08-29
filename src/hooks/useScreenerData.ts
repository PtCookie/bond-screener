import { queryOptions, useQuery } from "@tanstack/react-query";
import { fetchScreenerSnapshot } from "@/lib/snapshot/client";

/**
 * `staleTime: Infinity` — base 스냅샷은 basDt가 키에 박힌 불변 오브젝트고, 델타도
 * `/api/snapshot/index`가 지시하는 basDt가 바뀌지 않는 한 다시 받을 이유가 없다.
 * index 자체는 "오늘 새 델타가 올라왔는지"를 알아야 하므로 `fetchScreenerSnapshot`
 * 내부에서 매 호출 시 새로 받는다 — 그래서 다시 트리거하려면 `refetch()`를 쓴다.
 */
const screenerSnapshotQueryOptions = queryOptions({
  queryKey: ["screener-snapshot"],
  queryFn: fetchScreenerSnapshot,
  staleTime: Infinity,
});

export function useScreenerData() {
  return useQuery(screenerSnapshotQueryOptions);
}
