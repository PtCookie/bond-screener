import { useCallback, useDeferredValue, useMemo } from "react";
import { useTable, type PaginationState } from "@tanstack/react-table";
import { AppHeader } from "@/components/layout/AppHeader";
import { ErrorState } from "@/components/common/ErrorState";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { useScreenerViewState } from "@/hooks/useScreenerViewState";
import { useScreenerData } from "@/hooks/useScreenerData";
import { useFilterPresets } from "@/hooks/useFilterPresets";
import { toFriendlyErrorMessage } from "@/lib/errorMessage";
import { applyFilters, buildFilterOptions } from "@/lib/screener/filters";
import { decodePresetQuery, encodePresetQuery } from "@/lib/screener/presets";
import type { ScreenerRow, ScreenerStatus } from "@/lib/screener/types";
import { screenerColumns, screenerFeatures } from "./columns";
import { ScreenerFilterBar } from "./ScreenerFilterBar";
import { ScreenerPagination } from "./ScreenerPagination";
import { ScreenerTable } from "./ScreenerTable";

const EMPTY_ROWS: ScreenerRow[] = [];

function BondScreenerInner() {
  const { data, isPending, isError, error, refetch } = useScreenerData();
  const rows = data?.rows ?? EMPTY_ROWS;

  const { state, setFilters, setSorting, setPagination, applyFiltersAndSorting, resetFilters } = useScreenerViewState();
  const { presets, savePreset, deletePreset } = useFilterPresets();

  // 프리셋에 싣는 값은 deferredFilters가 아니라 state.filters다 — 지연 값은 렌더링 부하를
  // 미루기 위한 것이라, 저장 버튼을 누른 시점의 화면 입력과 한 틱 어긋날 수 있다.
  const presetQuery = useMemo(
    () => encodePresetQuery({ filters: state.filters, sorting: state.sorting }),
    [state.filters, state.sorting],
  );
  const applyPreset = useCallback(
    (query: string) => {
      const { filters, sorting } = decodePresetQuery(query);
      applyFiltersAndSorting(filters, sorting);
    },
    [applyFiltersAndSorting],
  );

  // 검색창 입력은 즉시 echo해야 하므로 state.filters 그대로 바인딩하고, 29k행 재필터링처럼
  // 무거운 계산만 지연시킨다 — 타이핑이 렌더링에 막히지 않는다.
  const deferredFilters = useDeferredValue(state.filters);
  const filteredRows = useMemo(() => applyFilters(rows, deferredFilters), [rows, deferredFilters]);
  // 선택지는 필터 결과가 아니라 원본 전체 기준 — 필터를 좁힐 때마다 다른 선택지가
  // 사라지면 다중선택을 넓히기 어려워진다.
  const filterOptions = useMemo(() => buildFilterOptions(rows), [rows]);

  const pagination: PaginationState = { pageIndex: state.pageIndex, pageSize: state.pageSize };

  // 건수·기준일자를 보여줄 근거가 있는지 — 헤더/필터바/페이지네이션이 공유하는 하나의 신호.
  // useScreenerData는 placeholderData가 없어 isPending은 정확히 "아직 데이터가 없다"를 뜻한다.
  const status: ScreenerStatus = isError ? "error" : isPending ? "loading" : "ready";

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
      <AppHeader title="채권 스크리너" summary={{ basDt: data?.priceBasDt ?? data?.basDt ?? null, status }} />
      {/* 스켈레톤 행은 aria-hidden이라 로딩 사실을 AT에 알리는 건 이 리전 하나다.
          조건부 마운트가 아니라 항상 마운트하고 텍스트만 교체한다 — 리전이 내용과 동시에
          삽입되면 낭독이 일관되지 않는다. 문구에 "건"·"전체"·숫자를 넣지 않는 것은 의도적이다:
          테스트와 E2E가 getByText 부분일치로 건수 문자열을 찾고 있어(건수의 소유자는
          ScreenerFilterBar 배지 하나뿐이라는 전제로 exact 없이 쓰는 곳이 있다) 여기에
          숫자를 넣으면 그 셀렉터들이 엉뚱한 요소에 매치한다. */}
      <p role="status" className="sr-only">
        {isPending ? "채권 목록을 불러오는 중입니다." : ""}
      </p>
      {/* 표시 개수를 늘려 스크롤이 길어져도 적용된 필터가 계속 보이도록 sticky 고정
          (모바일에서는 접힌 한 줄만, 데스크톱은 전체 — ScreenerFilterBar가 직접 정한다).
          z-30: 아래 테이블 헤더(z-20)보다 위, 팝오버(z-50)보다는 아래. */}
      <ScreenerFilterBar
        filters={state.filters}
        options={filterOptions}
        onFiltersChange={setFilters}
        onReset={resetFilters}
        presets={presets}
        presetQuery={presetQuery}
        onSavePreset={savePreset}
        onDeletePreset={deletePreset}
        onApplyPreset={applyPreset}
        resultCount={filteredRows.length}
        totalCount={rows.length}
        status={status}
      />
      {isError ? (
        <div className="overflow-hidden rounded-lg border">
          <ErrorState message={toFriendlyErrorMessage(error)} onRetry={() => void refetch()} />
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border">
            <ScreenerTable table={table} isLoading={isPending} onResetFilters={resetFilters} />
          </div>
          <ScreenerPagination table={table} totalCount={filteredRows.length} status={status} />
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
