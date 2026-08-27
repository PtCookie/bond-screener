import { CaretDoubleLeftIcon, CaretDoubleRightIcon, CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import type { ReactTable } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { screenerFeatures } from "./columns";
import type { ScreenerRow } from "@/lib/screener/types";

interface ScreenerPaginationProps {
  table: ReactTable<typeof screenerFeatures, ScreenerRow>;
  totalCount: number;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export function ScreenerPagination({ table, totalCount }: ScreenerPaginationProps) {
  const { pageIndex, pageSize } = table.state.pagination;
  const start = totalCount === 0 ? 0 : pageIndex * pageSize + 1;
  const end = Math.min((pageIndex + 1) * pageSize, totalCount);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2">
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <span>
          {start}–{end} / 전체 {totalCount.toLocaleString("ko-KR")}건
        </span>
        <div className="flex items-center gap-0.5">
          {PAGE_SIZE_OPTIONS.map((size) => (
            <Button
              key={size}
              type="button"
              size="xs"
              variant={pageSize === size ? "secondary" : "ghost"}
              onClick={() => table.setPageSize(size)}
            >
              {size}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.firstPage()}
          aria-label="처음 페이지"
        >
          <CaretDoubleLeftIcon />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
          aria-label="이전 페이지"
        >
          <CaretLeftIcon />
        </Button>
        <span className={cn("text-muted-foreground min-w-16 text-center text-sm")}>
          {pageIndex + 1} / {Math.max(table.getPageCount(), 1)}
        </span>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          disabled={!table.getCanNextPage()}
          onClick={() => table.nextPage()}
          aria-label="다음 페이지"
        >
          <CaretRightIcon />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          disabled={!table.getCanNextPage()}
          onClick={() => table.lastPage()}
          aria-label="마지막 페이지"
        >
          <CaretDoubleRightIcon />
        </Button>
      </div>
    </div>
  );
}
