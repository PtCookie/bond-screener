/**
 * 채권 스크리너 필터링 순수 로직. 클라이언트가 받은 스냅샷 전체(29k행 안팎)를 이
 * 함수들로 걸러낸 뒤 TanStack Table에 넘긴다.
 *
 * TanStack Table v9의 컬럼 필터 API 대신 순수 함수로 둔 이유: (1) 검색 1개가 3개
 * 컬럼(종목명·발행인·ISIN)을 동시에 보고, 나머지는 다중선택·범위로 성격이 제각각이라
 * 컬럼 단위 필터 API에 억지로 얹으면 더 복잡해진다. (2) 순수 함수라 컴포넌트 렌더링
 * 없이 그대로 단위 테스트할 수 있다(`tests/screener-filters.test.ts`).
 *
 * 필터가 각각 어떤 행 필드를 보는지는 여기가 아니라 `filter-defs.ts`의 레지스트리에
 * 선언돼 있다 — 이 파일의 세 함수는 전부 그 레지스트리를 순회할 뿐이다.
 */
import {
  CHIP_FILTER_DEFS,
  SCREENER_FILTER_DEFS,
  type MultiFilterDef,
  type ScreenerFilterDef,
  isFilterActive,
} from "./filter-defs";
import { compareGrade } from "./format";
import type { ScreenerRow } from "./types";

/**
 * **키 이름이 곧 URL 쿼리 파라미터 이름이다**(`view-state.ts`) — 이미 공유된 링크와
 * localStorage에 저장된 프리셋이 이 이름에 걸려 있으므로 바꾸지 말 것. 새 필터를 더할
 * 때는 여기에 키를 추가하고 `filter-defs.ts`에 def를 추가하면 나머지는 따라온다
 * (`tests/screener-filter-defs.test.ts`가 양쪽이 어긋나면 실패시킨다).
 */
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
  /** 발행일 범위, YYYYMMDD 정수(inclusive). */
  issuDtFrom: number | null;
  issuDtTo: number | null;
  /** 표면이율(%) 범위(inclusive). 0은 유효값 — null과 구분해야 한다. */
  srfcInrtMin: number | null;
  srfcInrtMax: number | null;
  /** 수익률(%) 범위(inclusive). */
  clprBnfRtMin: number | null;
  clprBnfRtMax: number | null;
  /** 채권잔액 범위, 원 단위(inclusive). 입력 UI만 조/억/만 단위로 환산한다. */
  balMin: number | null;
  balMax: number | null;
  /** 종가 범위(inclusive). */
  clprPrcMin: number | null;
  clprPrcMax: number | null;
  /** 전일대비 범위(inclusive). 음수가 유효값이다. */
  clprVsMin: number | null;
  clprVsMax: number | null;
  /** 거래량 범위, 원 단위(inclusive). 입력 UI만 조/억/만 단위로 환산한다. */
  trquMin: number | null;
  trquMax: number | null;
}

export const EMPTY_FILTERS: ScreenerFilters = {
  q: "",
  grades: [],
  intTcds: [],
  markets: [],
  kinds: [],
  exprDtFrom: null,
  exprDtTo: null,
  issuDtFrom: null,
  issuDtTo: null,
  srfcInrtMin: null,
  srfcInrtMax: null,
  clprBnfRtMin: null,
  clprBnfRtMax: null,
  balMin: null,
  balMax: null,
  clprPrcMin: null,
  clprPrcMax: null,
  clprVsMin: null,
  clprVsMax: null,
  trquMin: null,
  trquMax: null,
};

type RowPredicate = (row: ScreenerRow) => boolean;

/**
 * def 하나를 행 술어로 굽는다. 비활성이면 `null`(= 항상 통과).
 *
 * 술어를 행 루프 **바깥에서** 한 번만 만드는 게 요점이다. 예전에는 활성 여부와 무관하게
 * 모든 검사를 29k행 전부에 돌렸지만, 이제 활성 필터 개수만큼만 돈다. 선택지 배열을
 * `Set`으로 승격하는 것도 여기서 한 번만 일어난다(`includes` O(n) → `has` O(1)).
 */
function buildPredicate(def: ScreenerFilterDef, filters: ScreenerFilters): RowPredicate | null {
  if (!isFilterActive(def, filters)) return null;

  switch (def.kind) {
    case "text": {
      const needle = filters[def.valueKey].trim().toLowerCase();
      const { getText } = def;
      return (row) => getText(row).toLowerCase().includes(needle);
    }
    case "multi": {
      const selected = new Set(filters[def.valueKey]);
      const { getCode } = def;
      // 다중선택이 활성이면 값이 null인 행은 제외한다.
      return (row) => {
        const code = getCode(row);
        return code !== null && selected.has(code);
      };
    }
    case "range": {
      const min = filters[def.minKey];
      const max = filters[def.maxKey];
      const { getValue } = def;
      // 범위가 활성이면 값이 null인 행은 제외한다. 경계는 양쪽 모두 inclusive.
      return (row) => {
        const value = getValue(row);
        if (value === null) return false;
        if (min !== null && value < min) return false;
        if (max !== null && value > max) return false;
        return true;
      };
    }
  }
}

/** 활성 필터가 없으면 `rows`를 그대로(동일 참조로) 반환한다 — 29k행 무의미 복사 방지. */
export function applyFilters(rows: ScreenerRow[], filters: ScreenerFilters): ScreenerRow[] {
  const predicates: RowPredicate[] = [];
  for (const def of SCREENER_FILTER_DEFS) {
    const predicate = buildPredicate(def, filters);
    if (predicate !== null) predicates.push(predicate);
  }
  if (predicates.length === 0) return rows;

  return rows.filter((row) => predicates.every((predicate) => predicate(row)));
}

/** min/max 쌍은 둘 다 채워도 1건으로 센다(def 하나 = 필터 하나). */
export function countActiveFilters(filters: ScreenerFilters): number {
  return SCREENER_FILTER_DEFS.filter((def) => isFilterActive(def, filters)).length;
}

export interface ScreenerFilterOption {
  code: string;
  label: string;
  count: number;
}

/**
 * def id로 접근한다(`options.grades`, `options.kinds`, ...). def id를 `ScreenerFilters`의
 * 키와 같게 맞춰 두었기 때문에 레지스트리 도입 전 호출부가 그대로 동작한다.
 */
export type ScreenerFilterOptions = Readonly<Record<string, ScreenerFilterOption[]>>;

function sortOptions(
  def: MultiFilterDef,
  counts: Map<string, { label: string; count: number }>,
): ScreenerFilterOption[] {
  // 정본 순서가 있는 필드(시장구분)는 **정렬이 아니라 필터로** 재현해야 한다 —
  // 인덱스로 sort만 하면 목록에 없는 미지의 값이 조용히 살아남는다.
  if (def.optionOrder !== undefined) {
    return def.optionOrder
      .filter((code) => counts.has(code))
      .map((code) => {
        const entry = counts.get(code);
        return { code, label: entry?.label ?? code, count: entry?.count ?? 0 };
      });
  }

  const options = [...counts.entries()].map(([code, v]) => ({ code, label: v.label, count: v.count }));
  return def.optionSort === "grade"
    ? options.sort((a, b) => compareGrade(a.code, b.code))
    : options.sort((a, b) => b.count - a.count);
}

/**
 * 데이터에 실제 등장한 값만으로 선택지를 만든다(등장하지 않는 코드를 고르게 하지 않는다).
 * 필터 결과가 아니라 **원본 전체 `rows`**를 넘겨야 한다 — 필터를 걸 때마다 다른 선택지가
 * 사라지면 사용자가 다중선택을 넓히기 어려워진다.
 */
export function buildFilterOptions(rows: ScreenerRow[]): ScreenerFilterOptions {
  const multiDefs = CHIP_FILTER_DEFS.filter((def): def is MultiFilterDef => def.kind === "multi");
  const countsByDef = new Map<string, Map<string, { label: string; count: number }>>(
    multiDefs.map((def) => [def.id, new Map()]),
  );

  // 행은 한 번만 순회하고, 그 안에서 다중선택 def별로 집계한다.
  for (const row of rows) {
    for (const def of multiDefs) {
      const code = def.getCode(row);
      if (code === null) continue;
      const counts = countsByDef.get(def.id);
      if (counts === undefined) continue;
      const existing = counts.get(code);
      if (existing) {
        existing.count++;
      } else {
        counts.set(code, { label: def.getLabel(row) ?? code, count: 1 });
      }
    }
  }

  const options: Record<string, ScreenerFilterOption[]> = {};
  for (const def of multiDefs) {
    options[def.id] = sortOptions(def, countsByDef.get(def.id) ?? new Map());
  }
  return options;
}
