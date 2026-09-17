import { CaretDoubleLeftIcon, CaretDoubleRightIcon, CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import type { ReactTable } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PAGE_SIZE_OPTIONS } from "@/lib/screener/view-state";
import { cn } from "cn";
import type { screenerFeatures } from "./columns";
import type { ScreenerRow, ScreenerStatus } from "@/lib/screener/types";

interface ScreenerPaginationProps {
  table: ReactTable<typeof screenerFeatures, ScreenerRow>;
  totalCount: number;
  /**
   * 기본값 `"ready"`. `"loading"`이면 **데이터에서 파생된 텍스트 두 곳만** 스켈레톤으로 바꾸고
   * 바 자체와 페이지 크기 버튼은 계속 렌더한다.
   *
   * 언마운트하지 않는 이유 ① 이 바는 max-h-[70vh]로 잘린 표 바로 아래 고정 높이 스트립이라
   * 사라졌다 나타나면 로딩 완료 순간 페이지가 튄다. ② 페이지 크기(25/50/100)와 활성 표시는
   * 데이터가 아니라 URL/sessionStorage에서 복원한 뷰 상태라 프레임 0에 이미 확정돼 있다 —
   * 틀린 정보를 숨기려고 맞는 정보까지 버릴 이유가 없다. ③ 이동 버튼 4개는 0행에서 이미
   * disabled다.
   *
   * `ScreenerPagination`은 `BondScreener`의 에러 분기 바깥(else)에만 있어 `"error"`를 받지 않는다.
   */
  status?: ScreenerStatus;
}

export function ScreenerPagination({ table, totalCount, status = "ready" }: ScreenerPaginationProps) {
  const { pageIndex, pageSize } = table.state.pagination;
  const start = totalCount === 0 ? 0 : pageIndex * pageSize + 1;
  const end = Math.min((pageIndex + 1) * pageSize, totalCount);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2">
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        {status === "loading" ? (
          <Skeleton className="h-4 w-32" aria-hidden="true" />
        ) : (
          <span>
            {start}–{end} / 전체 {totalCount.toLocaleString("ko-KR")}건
          </span>
        )}
        <div role="group" aria-label="페이지당 표시 개수" className="flex items-center gap-0.5">
          {PAGE_SIZE_OPTIONS.map((size) => (
            <Button
              key={size}
              type="button"
              size="xs"
              variant={pageSize === size ? "secondary" : "ghost"}
              aria-pressed={pageSize === size}
              aria-label={`${size}건씩 보기`}
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
          <CaretDoubleLeftIcon aria-hidden="true" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
          aria-label="이전 페이지"
        >
          <CaretLeftIcon aria-hidden="true" />
        </Button>
        {/* 복원된 pageIndex가 1인 채로 로딩하면 현재 코드는 "2 / 1"이라는 불가능한 값을
            그린다 — 페이지 수만이 아니라 슬롯 전체를 바꿔야 그것까지 막힌다. */}
        {status === "loading" ? (
          <Skeleton className="mx-2 h-4 w-16" aria-hidden="true" />
        ) : (
          <span className={cn("text-muted-foreground min-w-16 text-center text-sm")}>
            {pageIndex + 1} / {Math.max(table.getPageCount(), 1)}
          </span>
        )}
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          disabled={!table.getCanNextPage()}
          onClick={() => table.nextPage()}
          aria-label="다음 페이지"
        >
          <CaretRightIcon aria-hidden="true" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          disabled={!table.getCanNextPage()}
          onClick={() => table.lastPage()}
          aria-label="마지막 페이지"
        >
          <CaretDoubleRightIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
