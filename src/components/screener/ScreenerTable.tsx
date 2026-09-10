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

/**
 * 1열(종목명)을 좌측 sticky로 고정 — 11컬럼 가로 스크롤에서 종목명이 사라지면 표를 읽을 수 없다.
 * 행 hover 틴트(TableRow의 hover:bg-muted/50)는 반투명이라 sticky 셀에 그대로 쓰면 뒤로
 * 스크롤되는 다른 셀이 비친다 — bg-row-hover(불투명, muted를 background와 미리 합성한 값)로 대신 칠한다.
 */
const STICKY_FIRST_COL = "group-hover/row:bg-row-hover sticky left-0 z-10 bg-background transition-colors";

/**
 * 컬럼 헤더를 상단 sticky로 고정한다. `position: sticky`는 overflow가 visible이 아닌 가장 가까운
 * 조상을 기준으로 동작하는데, `Table`의 가로 스크롤 wrapper(`table-container`, overflow-x-auto)가
 * 이미 그 조건에 해당한다(CSS 스펙상 overflow-x가 visible이 아니면 overflow-y도 auto로 강제되어,
 * 실제로 세로 스크롤이 없어도 이 wrapper가 sticky의 기준 컨테이너가 돼버린다 — 실측 확인: 이
 * wrapper의 overflow를 걷어내지 않는 한 페이지(window) 스크롤에는 결코 반응하지 않는다).
 * 그래서 페이지 전체가 아니라 "이 테이블 자체"가 스크롤되도록 TABLE_MAX_HEIGHT_CLASS로 세로
 * 스크롤 상한을 주고, 헤더는 그 스크롤 기준(table-container)에 상대적인 top-0/top-12로 고정한다.
 * z-20은 STICKY_FIRST_COL(z-10)보다 위에 둬 스크롤 중 헤더 밑을 지나가는 본문 sticky 1열 셀에
 * 헤더가 가려지지 않게 한다.
 */
const STICKY_HEADER = "sticky top-0 z-20 bg-background";

/** 모바일 헤더 2행(데이터 컬럼)의 sticky top — 1행(종목명, h-12=3rem) 바로 아래에 붙인다. */
const STICKY_HEADER_ROW2 = "sticky top-12 z-20 bg-background";

/** 표시 개수를 늘려도 헤더/필터가 가려지지 않도록 테이블 자체에 세로 스크롤 상한을 둔다. */
const TABLE_MAX_HEIGHT_CLASS = "max-h-[70vh]";

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

/** 데스크톱(md 이상): 11컬럼 한 행, 종목명만 sticky. */
function DesktopTable({ table, rows }: { table: ScreenerReactTable; rows: ScreenerRowModel[] }) {
  const headerGroups = table.getHeaderGroups();
  const headers = headerGroups[0]?.headers ?? [];
  const minWidth = sumColWidths(headers.map((h) => h.column.columnDef.meta?.width));

  return (
    <Table className="table-fixed" containerClassName={TABLE_MAX_HEIGHT_CLASS} style={{ minWidth: `${minWidth}rem` }}>
      <colgroup>
        {headers.map((header) => (
          <col key={header.id} style={colWidthStyle(header.column.columnDef.meta?.width)} />
        ))}
      </colgroup>
      <TableHeader>
        {headerGroups.map((headerGroup) => (
          <TableRow key={headerGroup.id} className="group/row">
            {headerGroup.headers.map((header, idx) => (
              <TableHead
                key={header.id}
                className={cn(
                  idx === 0 && STICKY_FIRST_COL,
                  STICKY_HEADER,
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
          <TableRow key={row.id} className="group/row cursor-pointer" onClick={(e) => handleRowClick(e, row)}>
            {row.getAllCells().map((cell, idx) => (
              <TableCell
                key={cell.id}
                className={cn(
                  "truncate",
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
    <Table className="table-fixed" containerClassName={TABLE_MAX_HEIGHT_CLASS} style={{ minWidth: `${minWidth}rem` }}>
      <colgroup>
        {dataHeaders.map((header) => (
          <col key={header.id} style={colWidthStyle(header.column.columnDef.meta?.width)} />
        ))}
      </colgroup>
      <TableHeader>
        <TableRow>
          <TableHead colSpan={dataColCount} className={STICKY_HEADER}>
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
                STICKY_HEADER_ROW2,
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
