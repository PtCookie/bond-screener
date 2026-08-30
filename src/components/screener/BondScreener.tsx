import { useDeferredValue, useMemo } from "react";
import { useTable, type PaginationState } from "@tanstack/react-table";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { useScreenerViewState } from "@/hooks/useScreenerViewState";
import { useScreenerData } from "@/hooks/useScreenerData";
import { applyFilters, buildFilterOptions } from "@/lib/screener/filters";
import type { ScreenerRow } from "@/lib/screener/types";
import { screenerColumns, screenerFeatures } from "./columns";
import { ScreenerError } from "./ScreenerError";
import { ScreenerFilterBar } from "./ScreenerFilterBar";
import { ScreenerHeader } from "./ScreenerHeader";
import { ScreenerPagination } from "./ScreenerPagination";
import { ScreenerTable } from "./ScreenerTable";

const EMPTY_ROWS: ScreenerRow[] = [];

function BondScreenerInner() {
  const { data, isPending, isError, error, refetch } = useScreenerData();
  const rows = data?.rows ?? EMPTY_ROWS;

  const { state, setFilters, setSorting, setPagination, resetFilters } = useScreenerViewState();

  // 검색창 입력은 즉시 echo해야 하므로 state.filters 그대로 바인딩하고, 29k행 재필터링처럼
  // 무거운 계산만 지연시킨다 — 타이핑이 렌더링에 막히지 않는다.
  const deferredFilters = useDeferredValue(state.filters);
  const filteredRows = useMemo(() => applyFilters(rows, deferredFilters), [rows, deferredFilters]);
  // 선택지는 필터 결과가 아니라 원본 전체 기준 — 필터를 좁힐 때마다 다른 선택지가
  // 사라지면 다중선택을 넓히기 어려워진다.
  const filterOptions = useMemo(() => buildFilterOptions(rows), [rows]);

  const pagination: PaginationState = { pageIndex: state.pageIndex, pageSize: state.pageSize };

  const table = useTable({
    features: screenerFeatures,
    columns: screenerColumns,
    data: filteredRows,
    getRowId: (row) => row.isinCd,
    state: { sorting: state.sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    // 필터가 바뀌어 data 참조가 달라질 때마다 테이블이 자동으로 pageIndex를 0으로 되돌리면,
    // URL/sessionStorage에서 복원한 페이지 번호가 스냅샷 로드 직후(최초 data 교체)
    // 곧바로 지워진다. 페이지 리셋은 useScreenerViewState의 setFilters가 직접 처리하므로
    // 자동 리셋은 끈다.
    autoResetPageIndex: false,
  });

  return (
    <div className="space-y-4">
      {/* 시세 기준일(priceBasDt)이 사용자에게 의미 있는 "오늘 화면에 보이는 날짜"라 우선한다 —
          bond 정적 필드 기준일(basDt)은 시세보다 갱신이 드물다(주 1회). */}
      <ScreenerHeader
        basDt={data?.priceBasDt ?? data?.basDt ?? null}
        filteredCount={filteredRows.length}
        totalCount={rows.length}
      />
      <ScreenerFilterBar
        filters={state.filters}
        options={filterOptions}
        onFiltersChange={setFilters}
        onReset={resetFilters}
        resultCount={filteredRows.length}
        totalCount={rows.length}
      />
      {isError ? (
        <div className="overflow-hidden rounded-lg border">
          <ScreenerError
            message={error instanceof Error ? error.message : String(error)}
            onRetry={() => void refetch()}
          />
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border">
            <ScreenerTable table={table} isLoading={isPending} onResetFilters={resetFilters} />
          </div>
          <ScreenerPagination table={table} totalCount={filteredRows.length} />
        </>
      )}
    </div>
  );
}

export function BondScreener() {
  return (
    <QueryProvider>
      <BondScreenerInner />
    </QueryProvider>
  );
}
