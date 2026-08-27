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
}

/** 1열(종목명)을 좌측 sticky로 고정 — 13컬럼 가로 스크롤에서 종목명이 사라지면 표를 읽을 수 없다. */
const STICKY_FIRST_COL = "sticky left-0 z-10 bg-background group-hover/row:bg-muted";

export function ScreenerTable({ table, isLoading }: ScreenerTableProps) {
  if (isLoading) return <ScreenerSkeleton />;

  const rows = table.getRowModel().rows;
  if (rows.length === 0) return <ScreenerEmpty />;

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
          <TableRow key={row.id} className="group/row">
            {row.getAllCells().map((cell, idx) => (
              <TableCell
                key={cell.id}
                className={cn(
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
