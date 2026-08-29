import { useState } from "react";
import { useTable, type PaginationState, type SortingState } from "@tanstack/react-table";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { useScreenerData } from "@/hooks/useScreenerData";
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
      {/* 시세 기준일(priceBasDt)이 사용자에게 의미 있는 "오늘 화면에 보이는 날짜"라 우선한다 —
          bond 정적 필드 기준일(basDt)은 시세보다 갱신이 드물다(주 1회). */}
      <ScreenerHeader basDt={data?.priceBasDt ?? data?.basDt ?? null} totalCount={rows.length} />
      <ScreenerFilterBar />
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
            <ScreenerTable table={table} isLoading={isPending} />
          </div>
          <ScreenerPagination table={table} totalCount={rows.length} />
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
