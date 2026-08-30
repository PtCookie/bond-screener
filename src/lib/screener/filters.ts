/**
 * 채권 스크리너 필터링 순수 로직. 클라이언트가 받은 스냅샷 전체(29k행 안팎)를 이
 * 함수들로 걸러낸 뒤 TanStack Table에 넘긴다.
 *
 * TanStack Table v9의 컬럼 필터 API 대신 순수 함수로 둔 이유: (1) 검색 1개가 3개
 * 컬럼(종목명·발행인·ISIN)을 동시에 보고, 나머지는 다중선택·범위로 성격이 제각각이라
 * 컬럼 단위 필터 API에 억지로 얹으면 더 복잡해진다. (2) 순수 함수라 컴포넌트 렌더링
 * 없이 그대로 단위 테스트할 수 있다(`tests/screener-filters.test.ts`).
 */
import { BOND_MARKET_CATEGORIES } from "@/api";
import { compareGrade } from "./format";
import type { ScreenerRow } from "./types";

export interface ScreenerFilters {
  /** 종목명·발행인·ISIN 부분일치 검색어(대소문자 무시). */
  q: string;
  /** kisGrade 다중선택. */
  grades: string[];
  /** bondIntTcd 코드 다중선택 — 라벨(bondIntTcdNm)이 아니라 코드로 비교한다. */
  intTcds: string[];
  /** mrktCtg 다중선택. 이 필드는 원래 값 자체가 "KTS"/"일반채권"/"소액채권" 라벨이다. */
  markets: string[];
  /** scrsItmsKcd 코드 다중선택 — 라벨(scrsItmsKcdNm)이 아니라 코드로 비교한다. */
  kinds: string[];
  /** 만기일 범위, YYYYMMDD 정수(inclusive). */
  exprDtFrom: number | null;
  exprDtTo: number | null;
  /** 표면이율(%) 범위(inclusive). 0은 유효값 — null과 구분해야 한다. */
  srfcInrtMin: number | null;
  srfcInrtMax: number | null;
  /** 잔액 범위(inclusive). */
  bondBalMin: number | null;
  bondBalMax: number | null;
  /** 수익률(%) 범위(inclusive). */
  clprBnfRtMin: number | null;
  clprBnfRtMax: number | null;
}

export const EMPTY_FILTERS: ScreenerFilters = {
  q: "",
  grades: [],
  intTcds: [],
  markets: [],
  kinds: [],
  exprDtFrom: null,
  exprDtTo: null,
  srfcInrtMin: null,
  srfcInrtMax: null,
  bondBalMin: null,
  bondBalMax: null,
  clprBnfRtMin: null,
  clprBnfRtMax: null,
};

/** 범위 필터가 비활성(min/max 둘 다 null)이면 항상 통과, 활성이면 값이 null인 행은 제외한다. */
function inRange(value: number | null, min: number | null, max: number | null): boolean {
  if (min === null && max === null) return true;
  if (value === null) return false;
  if (min !== null && value < min) return false;
  if (max !== null && value > max) return false;
  return true;
}

/** 다중선택이 비어 있으면 항상 통과, 선택돼 있으면 값이 null인 행은 제외한다. */
function inSet(value: string | null, selected: string[]): boolean {
  if (selected.length === 0) return true;
  if (value === null) return false;
  return selected.includes(value);
}

export function countActiveFilters(filters: ScreenerFilters): number {
  let n = 0;
  if (filters.q.trim() !== "") n++;
  if (filters.grades.length > 0) n++;
  if (filters.intTcds.length > 0) n++;
  if (filters.markets.length > 0) n++;
  if (filters.kinds.length > 0) n++;
  if (filters.exprDtFrom !== null || filters.exprDtTo !== null) n++;
  if (filters.srfcInrtMin !== null || filters.srfcInrtMax !== null) n++;
  if (filters.bondBalMin !== null || filters.bondBalMax !== null) n++;
  if (filters.clprBnfRtMin !== null || filters.clprBnfRtMax !== null) n++;
  return n;
}

/** 활성 필터가 없으면 `rows`를 그대로(동일 참조로) 반환한다 — 29k행 무의미 복사 방지. */
export function applyFilters(rows: ScreenerRow[], filters: ScreenerFilters): ScreenerRow[] {
  if (countActiveFilters(filters) === 0) return rows;

  const q = filters.q.trim().toLowerCase();

  return rows.filter((row) => {
    if (q !== "") {
      const haystack = `${row.isinCdNm ?? ""} ${row.bondIsurNm ?? ""} ${row.isinCd}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (!inSet(row.kisGrade, filters.grades)) return false;
    if (!inSet(row.bondIntTcd, filters.intTcds)) return false;
    if (!inSet(row.mrktCtg, filters.markets)) return false;
    if (!inSet(row.scrsItmsKcd, filters.kinds)) return false;
    if (!inRange(row.bondExprDt, filters.exprDtFrom, filters.exprDtTo)) return false;
    if (!inRange(row.bondSrfcInrt, filters.srfcInrtMin, filters.srfcInrtMax)) return false;
    if (!inRange(row.bondBal, filters.bondBalMin, filters.bondBalMax)) return false;
    if (!inRange(row.clprBnfRt, filters.clprBnfRtMin, filters.clprBnfRtMax)) return false;
    return true;
  });
}

export interface ScreenerFilterOption {
  code: string;
  label: string;
  count: number;
}

export interface ScreenerFilterOptions {
  grades: ScreenerFilterOption[];
  intTcds: ScreenerFilterOption[];
  markets: ScreenerFilterOption[];
  kinds: ScreenerFilterOption[];
}

/** `code`별 건수와 대표 라벨(첫 등장 값)을 집계한다. `code`가 null인 행은 건너뛴다. */
function countByCode(
  rows: ScreenerRow[],
  getCode: (row: ScreenerRow) => string | null,
  getLabel: (row: ScreenerRow) => string | null,
): Map<string, { label: string; count: number }> {
  const counts = new Map<string, { label: string; count: number }>();
  for (const row of rows) {
    const code = getCode(row);
    if (code === null) continue;
    const existing = counts.get(code);
    if (existing) {
      existing.count++;
    } else {
      counts.set(code, { label: getLabel(row) ?? code, count: 1 });
    }
  }
  return counts;
}

/**
 * 데이터에 실제 등장한 값만으로 선택지를 만든다(등장하지 않는 코드를 고르게 하지 않는다).
 * 필터 결과가 아니라 **원본 전체 `rows`**를 넘겨야 한다 — 필터를 걸 때마다 다른 선택지가
 * 사라지면 사용자가 다중선택을 넓히기 어려워진다.
 */
export function buildFilterOptions(rows: ScreenerRow[]): ScreenerFilterOptions {
  const gradeCounts = countByCode(
    rows,
    (r) => r.kisGrade,
    (r) => r.kisGrade,
  );
  const grades = [...gradeCounts.entries()]
    .map(([code, v]) => ({ code, label: v.label, count: v.count }))
    .sort((a, b) => compareGrade(a.code, b.code));

  const intTcdCounts = countByCode(
    rows,
    (r) => r.bondIntTcd,
    (r) => r.bondIntTcdNm,
  );
  const intTcds = [...intTcdCounts.entries()]
    .map(([code, v]) => ({ code, label: v.label, count: v.count }))
    .sort((a, b) => b.count - a.count);

  const kindCounts = countByCode(
    rows,
    (r) => r.scrsItmsKcd,
    (r) => r.scrsItmsKcdNm,
  );
  const kinds = [...kindCounts.entries()]
    .map(([code, v]) => ({ code, label: v.label, count: v.count }))
    .sort((a, b) => b.count - a.count);

  const marketCounts = countByCode(
    rows,
    (r) => r.mrktCtg,
    (r) => r.mrktCtg,
  );
  const markets = BOND_MARKET_CATEGORIES.filter((m) => marketCounts.has(m)).map((m) => {
    const entry = marketCounts.get(m);
    return { code: m, label: m, count: entry?.count ?? 0 };
  });

  return { grades, intTcds, markets, kinds };
}
