import type { MouseEvent, CSSProperties } from "react";
import type { ReactTable, Row } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import { ScreenerEmpty } from "./ScreenerEmpty";
import { ScreenerSkeleton } from "./ScreenerSkeleton";
import { ScreenerSortButton } from "./ScreenerSortButton";
import type { screenerFeatures } from "./columns";
import type { ScreenerRow } from "@/lib/screener/types";

type ScreenerReactTable = ReactTable<typeof screenerFeatures, ScreenerRow>;
type ScreenerRowModel = Row<typeof screenerFeatures, ScreenerRow>;

interface ScreenerTableProps {
  table: ScreenerReactTable;
  isLoading: boolean;
  /** 필터가 걸린 상태로 0건이 된 경우에만 넘긴다 — ScreenerEmpty의 "필터 초기화" 버튼용. */
  onResetFilters?: () => void;
}

/** 1열(종목명)을 좌측 sticky로 고정 — 13컬럼 가로 스크롤에서 종목명이 사라지면 표를 읽을 수 없다. */
const STICKY_FIRST_COL = "sticky left-0 z-10 bg-background";

/** 모바일에서 sticky 종목명이 뚫고 나갈 수 있는 최대 폭 — 페이지 좌우 padding(px-4 × 2 = 2rem) + 여유. */
const MOBILE_NAME_MAX_WIDTH = "max-w-[calc(100vw-3rem)]";

function colWidthStyle(width: number | undefined): CSSProperties {
  return width === undefined ? {} : { width: `${width}rem` };
}

function sumColWidths(widths: (number | undefined)[]): number {
  return widths.reduce<number>((sum, w) => sum + (w ?? 0), 0);
}

function handleRowClick(e: MouseEvent<HTMLTableRowElement>, row: ScreenerRowModel): void {
  if ((e.target as HTMLElement).closest("a, button")) return;
  window.location.href = `/bond/${row.original.isinCd}`;
}

/** 데스크톱(md 이상): 13컬럼 한 행, 종목명만 sticky. */
function DesktopTable({ table, rows }: { table: ScreenerReactTable; rows: ScreenerRowModel[] }) {
  const headerGroups = table.getHeaderGroups();
  const headers = headerGroups[0]?.headers ?? [];
  const minWidth = sumColWidths(headers.map((h) => h.column.columnDef.meta?.width));

  return (
    <Table className="table-fixed" style={{ minWidth: `${minWidth}rem` }}>
      <colgroup>
        {headers.map((header) => (
          <col key={header.id} style={colWidthStyle(header.column.columnDef.meta?.width)} />
        ))}
      </colgroup>
      <TableHeader>
        {headerGroups.map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header, idx) => (
              <TableHead
                key={header.id}
                className={cn(
                  idx === 0 && STICKY_FIRST_COL,
                  header.column.columnDef.meta?.align === "end" && "text-right",
                  header.column.columnDef.meta?.groupStart && "border-l",
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
            onClick={(e) => handleRowClick(e, row)}
          >
            {row.getAllCells().map((cell, idx) => (
              <TableCell
                key={cell.id}
                className={cn(
                  "group-hover/row:bg-muted/50 truncate",
                  idx === 0 && STICKY_FIRST_COL,
                  cell.column.columnDef.meta?.align === "end" && "text-right tabular-nums",
                  cell.column.columnDef.meta?.groupStart && "border-l",
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

/** 모바일(md 미만): 종목당 2행 — 1행 종목명(sticky, 전체폭), 2행 나머지 컬럼(가로 스크롤). */
function MobileTable({ table, rows }: { table: ScreenerReactTable; rows: ScreenerRowModel[] }) {
  const headers = table.getHeaderGroups()[0]?.headers ?? [];
  const [nameHeader, ...dataHeaders] = headers;
  const dataColCount = dataHeaders.length;
  const minWidth = sumColWidths(dataHeaders.map((h) => h.column.columnDef.meta?.width));

  return (
    <Table className="table-fixed" style={{ minWidth: `${minWidth}rem` }}>
      <colgroup>
        {dataHeaders.map((header) => (
          <col key={header.id} style={colWidthStyle(header.column.columnDef.meta?.width)} />
        ))}
      </colgroup>
      <TableHeader>
        <TableRow>
          <TableHead colSpan={dataColCount}>
            {nameHeader && (
              <div className={cn("sticky left-0", MOBILE_NAME_MAX_WIDTH)}>
                <ScreenerSortButton header={nameHeader} />
              </div>
            )}
          </TableHead>
        </TableRow>
        <TableRow>
          {dataHeaders.map((header) => (
            <TableHead
              key={header.id}
              className={cn(
                header.column.columnDef.meta?.align === "end" && "text-right",
                header.column.columnDef.meta?.groupStart && "border-l",
              )}
            >
              <ScreenerSortButton header={header} />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const [nameCell, ...dataCells] = row.getAllCells();
          return [
            <TableRow
              key={`${row.id}-name`}
              className={cn("hover:bg-muted/50 cursor-pointer", "border-b-0")}
              onClick={(e) => handleRowClick(e, row)}
            >
              <TableCell colSpan={dataColCount} className="pb-1">
                {nameCell && (
                  <div className={cn("sticky left-0 font-medium", MOBILE_NAME_MAX_WIDTH)}>
                    <table.FlexRender cell={nameCell} />
                  </div>
                )}
              </TableCell>
            </TableRow>,
            <TableRow
              key={`${row.id}-data`}
              className="hover:bg-muted/50 cursor-pointer"
              onClick={(e) => handleRowClick(e, row)}
            >
              {dataCells.map((cell) => (
                <TableCell
                  key={cell.id}
                  className={cn(
                    "truncate",
                    cell.column.columnDef.meta?.align === "end" && "text-right tabular-nums",
                    cell.column.columnDef.meta?.groupStart && "border-l",
                  )}
                >
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>,
          ];
        })}
      </TableBody>
    </Table>
  );
}

export function ScreenerTable({ table, isLoading, onResetFilters }: ScreenerTableProps) {
  const isMobile = useIsMobile();

  if (isLoading) return <ScreenerSkeleton />;

  const rows = table.getRowModel().rows;
  if (rows.length === 0) return <ScreenerEmpty onResetFilters={onResetFilters} />;

  return isMobile ? <MobileTable table={table} rows={rows} /> : <DesktopTable table={table} rows={rows} />;
}
