import {
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  type Row,
  type SortFn,
} from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { compareGrade, fmtAmount, fmtDelta, fmtPrice, fmtRate, fmtYmd, deltaTone, DASH } from "@/lib/screener/format";
import type { ScreenerRow } from "@/lib/screener/types";

/** 이 화면이 실제로 쓰는 기능만 등록한다 — 필터는 껍데기라 등록하지 않는다. */
export const screenerFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

type Features = typeof screenerFeatures;

/**
 * null을 항상(오름/내림차순 무관하게) 뒤로 보내는 정렬 래퍼.
 *
 * TanStack Table v9의 정렬 파이프라인(`createSortedRowModel.js`)은 desc일 때
 * `sortFn`의 반환값을 그대로 `*= -1`로 뒤집는다. 그래서 "null은 항상 +1(뒤)"처럼
 * 방향에 무관한 고정값을 리턴하면 desc에서는 그 부호까지 반전되어 null이 맨
 * 앞으로 튀어나온다(실측으로 재현 확인됨). `row.table.getColumn(columnId).getIsSorted()`로
 * 현재 방향을 미리 알아내 null 쪽 부호를 선반영해야, 바깥의 반전과 상쇄되어
 * 항상 뒤에 남는다.
 */
function nullsLastSortFn<T>(
  getValue: (row: Row<Features, ScreenerRow>, columnId: string) => T | null,
  compareNonNull: (a: T, b: T) => number,
): SortFn<Features, ScreenerRow> {
  return (rowA, rowB, columnId) => {
    const a = getValue(rowA, columnId);
    const b = getValue(rowB, columnId);
    if (a === null || b === null) {
      if (a === null && b === null) return 0;
      const isDesc = rowA.table.getColumn(columnId)?.getIsSorted() === "desc";
      const sign = isDesc ? -1 : 1;
      return a === null ? sign : -sign;
    }
    return compareNonNull(a, b);
  };
}

const numericSortFn: SortFn<Features, ScreenerRow> = nullsLastSortFn<number>(
  (row, id) => row.getValue<number | null>(id),
  (a, b) => a - b,
);

const gradeSortFn: SortFn<Features, ScreenerRow> = nullsLastSortFn<string>(
  (row, id) => row.getValue<string | null>(id),
  (a, b) => compareGrade(a, b),
);

const helper = createColumnHelper<Features, ScreenerRow>();

export const screenerColumns = helper.columns([
  helper.accessor("isinCdNm", {
    header: "종목명",
    cell: (c) => {
      const v = c.getValue();
      return (
        <a href={`/bond/${c.row.original.isinCd}`} className="block truncate" title={v ?? undefined}>
          {v ?? DASH}
        </a>
      );
    },
    meta: { width: 16 },
  }),
  helper.accessor("bondIsurNm", {
    header: "발행인",
    cell: (c) => {
      const v = c.getValue();
      return (
        <span className="block truncate" title={v ?? undefined}>
          {v ?? DASH}
        </span>
      );
    },
    meta: { width: 10 },
  }),
  helper.accessor("scrsItmsKcdNm", {
    header: "종류",
    cell: (c) => {
      const v = c.getValue();
      return (
        <span className="block truncate" title={v ?? undefined}>
          {v ?? DASH}
        </span>
      );
    },
    meta: { width: 6 },
  }),
  helper.accessor("bondIssuDt", {
    header: "발행일",
    cell: (c) => fmtYmd(c.getValue()),
    sortFn: numericSortFn,
    meta: { width: 6.5 },
  }),
  helper.accessor("bondExprDt", {
    header: "만기일",
    cell: (c) => fmtYmd(c.getValue()),
    sortFn: numericSortFn,
    meta: { width: 6.5 },
  }),
  helper.accessor("bondSrfcInrt", {
    header: "표면이율",
    cell: (c) => fmtRate(c.getValue()),
    sortFn: numericSortFn,
    meta: { align: "end", width: 6 },
  }),
  helper.accessor("kisGrade", {
    header: "신용등급",
    cell: (c) => {
      const v = c.getValue();
      return v ? <Badge variant="secondary">{v}</Badge> : DASH;
    },
    sortFn: gradeSortFn,
    meta: { width: 6 },
  }),
  helper.accessor("bondBal", {
    header: "잔액",
    cell: (c) => fmtAmount(c.getValue()),
    sortFn: numericSortFn,
    meta: { align: "end", width: 6 },
  }),
  helper.accessor("bondIntTcdNm", {
    header: "이자유형",
    cell: (c) => {
      const v = c.getValue();
      return (
        <span className="block truncate" title={v ?? undefined}>
          {v ?? DASH}
        </span>
      );
    },
    meta: { width: 6 },
  }),
  helper.accessor("clprPrc", {
    header: "종가",
    cell: (c) => fmtPrice(c.getValue()),
    sortFn: numericSortFn,
    meta: { align: "end", width: 6, groupStart: true },
  }),
  helper.accessor("clprVs", {
    header: "전일대비",
    cell: (c) => {
      const v = c.getValue();
      const tone = deltaTone(v);
      const toneClass = tone === "up" ? "text-price-up" : tone === "down" ? "text-price-down" : "text-muted-foreground";
      return <span className={toneClass}>{fmtDelta(v)}</span>;
    },
    sortFn: numericSortFn,
    meta: { align: "end", width: 6.5 },
  }),
  helper.accessor("clprBnfRt", {
    header: "수익률",
    cell: (c) => fmtRate(c.getValue()),
    sortFn: numericSortFn,
    meta: { align: "end", width: 6 },
  }),
  helper.accessor("trqu", {
    header: "거래량",
    cell: (c) => fmtAmount(c.getValue()),
    sortFn: numericSortFn,
    meta: { align: "end", width: 6 },
  }),
]);
