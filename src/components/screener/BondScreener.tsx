import { useMemo, useState } from "react";
import { useTable, type PaginationState, type SortingState } from "@tanstack/react-table";
import { MOCK_ROWS } from "@/lib/screener/mock";
import { screenerColumns, screenerFeatures } from "./columns";
import { ScreenerFilterBar } from "./ScreenerFilterBar";
import { ScreenerHeader } from "./ScreenerHeader";
import { ScreenerPagination } from "./ScreenerPagination";
import { ScreenerTable } from "./ScreenerTable";

/** mock 기준일자. 실 데이터 전환 시 스냅샷의 basDt로 교체. */
const MOCK_BAS_DT = 20260826;

export type ScreenerDebugState = "loading" | "empty" | null;

interface BondScreenerProps {
  /**
   * `?state=loading` / `?state=empty`로 로딩·빈 상태를 눈으로 확인하기 위한 디버그
   * 스위치 — 실 데이터 전환 시 제거. Astro가 `Astro.url.searchParams`로 서버에서
   * 읽어 prop으로 내려준다: React island 내부에서 `window`로 직접 읽으면 서버
   * 렌더(`output: "server"`라 항상 window 없음 → null)와 클라이언트 하이드레이션
   * 결과가 달라져 하이드레이션 불일치가 난다(실측으로 재현 확인됨).
   */
  debugState?: ScreenerDebugState;
}

export function BondScreener({ debugState = null }: BondScreenerProps) {
  const rows = useMemo(() => (debugState === "empty" ? [] : MOCK_ROWS), [debugState]);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });

  const table = useTable({
    features: screenerFeatures,
    columns: screenerColumns,
    data: rows,
    getRowId: (row) => row.isinCd,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
  });

  return (
    <div className="space-y-4">
      <ScreenerHeader basDt={MOCK_BAS_DT} totalCount={rows.length} />
      <ScreenerFilterBar />
      <div className="overflow-hidden rounded-lg border">
        <ScreenerTable table={table} isLoading={debugState === "loading"} />
      </div>
      <ScreenerPagination table={table} totalCount={rows.length} />
    </div>
  );
}
