import type { MouseEvent, CSSProperties } from "react";
import type { Header, ReactTable, Row } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import { ScreenerEmpty } from "./ScreenerEmpty";
import { ScreenerSkeletonBar, skeletonRowCount } from "./ScreenerSkeleton";
import { ariaSortOf, ScreenerSortButton } from "./ScreenerSortButton";
import { MOBILE_DATA_COLUMN_ORDER, MOBILE_GROUP_START_COLUMN, type screenerFeatures } from "./columns";
import type { ScreenerRow } from "@/lib/screener/types";

type ScreenerReactTable = ReactTable<typeof screenerFeatures, ScreenerRow>;
type ScreenerRowModel = Row<typeof screenerFeatures, ScreenerRow>;
type ScreenerHeaderCell = Header<typeof screenerFeatures, ScreenerRow, unknown>;
type ScreenerColumn = ScreenerHeaderCell["column"];

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

/** 실제 셀과 스켈레톤 셀이 공유하는 정렬/구분선 클래스 — 둘이 어긋나면 스켈레톤이 표와 닮지 않는다. */
function cellMetaClass(header: ScreenerHeaderCell): string {
  return cn(
    header.column.columnDef.meta?.align === "end" && "text-right",
    header.column.columnDef.meta?.groupStart && "border-l",
  );
}

/**
 * 모바일 데이터 컬럼(종목명 제외)을 `MOBILE_DATA_COLUMN_ORDER` 순서로 재배열한다. 헤더 행과
 * 데이터 셀 양쪽에서 쓰므로 `column.id`만 있으면 되는 제네릭으로 둔다. 목록에 없는 컬럼(새
 * 컬럼 추가 시)은 끝에 그대로 덧붙인다 — 재배열 목록을 깜빡 갱신하지 않아도 모바일에서
 * 조용히 사라지지 않는다.
 */
function orderForMobile<T extends { column: { id: string } }>(items: T[]): T[] {
  const byId = new Map(items.map((item) => [item.column.id, item]));
  const ordered = MOBILE_DATA_COLUMN_ORDER.map((id) => byId.get(id)).filter((item): item is T => item !== undefined);
  const orderedIds = new Set(ordered.map((item) => item.column.id));
  return [...ordered, ...items.filter((item) => !orderedIds.has(item.column.id))];
}

/**
 * 모바일 재배열 후의 정렬/구분선 클래스. 데스크톱의 `cellMetaClass`와 달리 구분선은
 * `meta.groupStart`가 아니라 `MOBILE_GROUP_START_COLUMN`(재배열된 "핵심 3열"과 나머지의
 * 경계) 기준이다 — 재배열된 순서에서는 `meta.groupStart`가 더 이상 그 경계와 일치하지 않는다.
 */
function mobileMetaClass(column: ScreenerColumn): string {
  return cn(
    column.columnDef.meta?.align === "end" && "text-right",
    column.id === MOBILE_GROUP_START_COLUMN && "border-l",
  );
}

function handleRowClick(e: MouseEvent<HTMLTableRowElement>, row: ScreenerRowModel): void {
  if ((e.target as HTMLElement).closest("a, button")) return;
  window.location.href = `/bond/${row.original.isinCd}`;
}

/**
 * 로딩 중에도 헤더·colgroup·sticky는 **진짜**를 그대로 쓰고 본문만 이 행들로 채운다
 * (`table.getHeaderGroups()`는 데이터가 비어도 동작한다) — 그래서 컬럼 폭이 `meta.width`로부터
 * 자동으로 상속되고, 데이터가 도착해도 표 모양이 바뀌지 않는다.
 *
 * `aria-hidden`: 장식이라 스크린리더가 빈 셀 수백 개를 읽지 않게 감춘다(로딩 사실은
 * `BondScreener`의 라이브 리전이 알린다). 포커스 가능한 요소가 없어 감춰도 안전하다.
 * `data-slot`: `TableRow`가 props를 자신의 `data-slot="table-row"` 뒤에 spread하므로 깨끗이
 * 덮어써지고, 테스트가 실제 행과 스켈레톤 행을 구분하는 훅이 된다.
 */
function DesktopSkeletonRows({ headers, count }: { headers: ScreenerHeaderCell[]; count: number }) {
  return Array.from({ length: count }, (_, r) => (
    <TableRow key={`sk-${r}`} data-slot="screener-skeleton-row" aria-hidden="true" className="group/row">
      {headers.map((header, idx) => (
        <TableCell key={header.id} className={cn(idx === 0 && STICKY_FIRST_COL, cellMetaClass(header))}>
          <ScreenerSkeletonBar rowIdx={r} colIdx={idx} align={header.column.columnDef.meta?.align} />
        </TableCell>
      ))}
    </TableRow>
  ));
}

/**
 * 모바일 스켈레톤 — 실제 모바일 레이아웃과 같이 종목당 2행(이름 행 + 데이터 행)을 낸다.
 * `dataHeaders`는 호출부(`MobileTable`)가 이미 `orderForMobile`로 재배열해 넘긴다.
 */
function MobileSkeletonRows({ dataHeaders, count }: { dataHeaders: ScreenerHeaderCell[]; count: number }) {
  return Array.from({ length: count }, (_, b) => [
    <TableRow key={`sk-${b}-name`} data-slot="screener-skeleton-row" aria-hidden="true" className="border-b-0">
      <TableCell colSpan={dataHeaders.length} className="pb-1">
        <div className={cn("sticky left-0", MOBILE_NAME_MAX_WIDTH)}>
          <ScreenerSkeletonBar rowIdx={b} colIdx={0} />
        </div>
      </TableCell>
    </TableRow>,
    <TableRow key={`sk-${b}-data`} data-slot="screener-skeleton-row" aria-hidden="true">
      {dataHeaders.map((header, idx) => (
        <TableCell key={header.id} className={mobileMetaClass(header.column)}>
          <ScreenerSkeletonBar rowIdx={b} colIdx={idx + 1} align={header.column.columnDef.meta?.align} />
        </TableCell>
      ))}
    </TableRow>,
  ]);
}

/** 데스크톱(md 이상): 11컬럼 한 행, 종목명만 sticky. */
function DesktopTable({
  table,
  rows,
  isLoading,
}: {
  table: ScreenerReactTable;
  rows: ScreenerRowModel[];
  isLoading: boolean;
}) {
  const headerGroups = table.getHeaderGroups();
  const headers = headerGroups[0]?.headers ?? [];
  const minWidth = sumColWidths(headers.map((h) => h.column.columnDef.meta?.width));

  return (
    <Table
      className="table-fixed"
      containerClassName={TABLE_MAX_HEIGHT_CLASS}
      style={{ minWidth: `${minWidth}rem` }}
      aria-busy={isLoading}
    >
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
                aria-sort={ariaSortOf(header)}
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
        {isLoading ? (
          <DesktopSkeletonRows headers={headers} count={skeletonRowCount(table.state.pagination.pageSize, false)} />
        ) : (
          rows.map((row) => (
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
          ))
        )}
      </TableBody>
    </Table>
  );
}

/** 모바일(md 미만): 종목당 2행 — 1행 종목명(sticky, 전체폭), 2행 나머지 컬럼(가로 스크롤). */
function MobileTable({
  table,
  rows,
  isLoading,
}: {
  table: ScreenerReactTable;
  rows: ScreenerRowModel[];
  isLoading: boolean;
}) {
  const headers = table.getHeaderGroups()[0]?.headers ?? [];
  const [nameHeader, ...rawDataHeaders] = headers;
  // 데스크톱 컬럼 순서 그대로 두면 종류·발행일·표면이율이 앞을 차지해 시세 값이 가로 스크롤
  // 너머로 밀려난다(ui-audit ⑨) — 모바일에서만 "핵심 3열"(만기일·종가·수익률)을 앞으로 뺀다.
  const dataHeaders = orderForMobile(rawDataHeaders);
  const dataColCount = dataHeaders.length;
  const minWidth = sumColWidths(dataHeaders.map((h) => h.column.columnDef.meta?.width));

  return (
    <Table
      className="table-fixed"
      containerClassName={TABLE_MAX_HEIGHT_CLASS}
      style={{ minWidth: `${minWidth}rem` }}
      aria-busy={isLoading}
    >
      <colgroup>
        {dataHeaders.map((header) => (
          <col key={header.id} style={colWidthStyle(header.column.columnDef.meta?.width)} />
        ))}
      </colgroup>
      <TableHeader>
        <TableRow>
          <TableHead colSpan={dataColCount} aria-sort={nameHeader && ariaSortOf(nameHeader)} className={STICKY_HEADER}>
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
              aria-sort={ariaSortOf(header)}
              className={cn(STICKY_HEADER_ROW2, mobileMetaClass(header.column))}
            >
              <ScreenerSortButton header={header} />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <MobileSkeletonRows
            dataHeaders={dataHeaders}
            count={skeletonRowCount(table.state.pagination.pageSize, true)}
          />
        ) : (
          rows.map((row) => {
            const [nameCell, ...rawDataCells] = row.getAllCells();
            const dataCells = orderForMobile(rawDataCells);
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
                      mobileMetaClass(cell.column),
                      cell.column.columnDef.meta?.align === "end" && "tabular-nums",
                    )}
                  >
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>,
            ];
          })
        )}
      </TableBody>
    </Table>
  );
}

export function ScreenerTable({ table, isLoading, onResetFilters }: ScreenerTableProps) {
  const isMobile = useIsMobile();

  // 로딩 중에는 표를 통째로 다른 컴포넌트로 갈아끼우지 않고 본문만 스켈레톤으로 채운다 —
  // 헤더·컬럼 폭·sticky가 진짜 그대로라 데이터가 도착해도 표 모양이 변하지 않는다.
  const rows = isLoading ? [] : table.getRowModel().rows;
  if (!isLoading && rows.length === 0) return <ScreenerEmpty onResetFilters={onResetFilters} />;

  return isMobile ? (
    <MobileTable table={table} rows={rows} isLoading={isLoading} />
  ) : (
    <DesktopTable table={table} rows={rows} isLoading={isLoading} />
  );
}
