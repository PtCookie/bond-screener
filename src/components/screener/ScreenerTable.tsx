import type { ReactTable } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ScreenerEmpty } from "./ScreenerEmpty";
import { ScreenerSkeleton } from "./ScreenerSkeleton";
import { ScreenerSortButton } from "./ScreenerSortButton";
import type { screenerFeatures } from "./columns";
import type { ScreenerRow } from "@/lib/screener/types";

interface ScreenerTableProps {
  table: ReactTable<typeof screenerFeatures, ScreenerRow>;
  isLoading: boolean;
  /** 필터가 걸린 상태로 0건이 된 경우에만 넘긴다 — ScreenerEmpty의 "필터 초기화" 버튼용. */
  onResetFilters?: () => void;
}

/** 1열(종목명)을 좌측 sticky로 고정 — 13컬럼 가로 스크롤에서 종목명이 사라지면 표를 읽을 수 없다. */
const STICKY_FIRST_COL = "sticky left-0 z-10 bg-background";

export function ScreenerTable({ table, isLoading, onResetFilters }: ScreenerTableProps) {
  if (isLoading) return <ScreenerSkeleton />;

  const rows = table.getRowModel().rows;
  if (rows.length === 0) return <ScreenerEmpty onResetFilters={onResetFilters} />;

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header, idx) => (
              <TableHead
                key={header.id}
                className={cn(
                  idx === 0 && STICKY_FIRST_COL,
                  header.column.columnDef.meta?.align === "end" && "text-right",
                  idx === headerGroup.headers.length - 4 && "border-l",
                )}
              >
                <ScreenerSortButton header={header} />
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow
            key={row.id}
            className="group/row cursor-pointer hover:bg-transparent"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a, button")) return;
              window.location.href = `/bond/${row.original.isinCd}`;
            }}
          >
            {row.getAllCells().map((cell, idx) => (
              <TableCell
                key={cell.id}
                className={cn(
                  "group-hover/row:bg-muted/50",
                  idx === 0 && STICKY_FIRST_COL,
                  cell.column.columnDef.meta?.align === "end" && "text-right tabular-nums",
                  idx === row.getAllCells().length - 4 && "border-l",
                )}
              >
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
