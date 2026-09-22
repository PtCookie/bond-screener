/**
 * 스크리너 필터 레지스트리 — 필터 하나가 어떤 행 필드를 보고, `ScreenerFilters`의 어떤
 * 키에 값을 담고, 어떤 UI로 그려지는지를 한곳에 모은다.
 *
 * 이 파일이 생기기 전에는 필터를 하나 더하려면 `ScreenerFilters`·`EMPTY_FILTERS`·
 * `countActiveFilters`·`applyFilters`·`encodeViewState`/`decodeViewState`·필터 바 JSX를
 * 동시에 고쳐야 했고, 그 비용 때문에 스냅샷에 이미 실려 오는 필드 몇 개가 필터 없이
 * 방치돼 있었다. 이제 위 전부가 `SCREENER_FILTER_DEFS`에서 파생된다.
 *
 * `ScreenerFilters`는 여전히 평면 구조다(키를 맵으로 바꾸지 않았다) — URL 파라미터
 * 이름이 곧 그 키라서, 구조를 바꾸면 이미 공유된 링크와 저장된 프리셋이 전부 깨진다.
 *
 * `filters.ts`의 타입만 `import type`으로 가져온다(런타임에 소거되므로 순환 없음).
 * `isFilterActive`/`clearFilter`/`resolveVisibleFilterIds`가 `filters.ts`가 아니라
 * 여기 사는 이유가 이것이다 — 셋 다 def를 받아야 해서 반대 방향 의존이 필요하다.
 */
import { BOND_MARKET_CATEGORIES } from "@/api";
import type { ScreenerFilters } from "./filters";
import type { ScreenerRow } from "./types";

/**
 * `ScreenerFilters`에서 값 타입이 `T`인 키만 뽑는다. def가 엉뚱한 키를 가리키면
 * 컴파일 에러가 난다.
 *
 * `ScreenerFilters[K]`는 indexed access라 조건부 타입이 분배되지 않는다 —
 * `string[] extends string`은 false라 `grades`가 `TextValueKey`에 섞이지 않고,
 * `number | null extends number | null`은 true라 범위 키가 정상적으로 잡힌다.
 */
type KeysOfType<T> = {
  [K in keyof ScreenerFilters]-?: ScreenerFilters[K] extends T ? K : never;
}[keyof ScreenerFilters];

export type TextValueKey = KeysOfType<string>;
export type MultiValueKey = KeysOfType<string[]>;
export type RangeBoundKey = KeysOfType<number | null>;

/**
 * 필터 식별자. **이 배열의 순서가 곧 칩의 화면 표시 순서다** — 필터 바는 언제나
 * `CHIP_FILTER_DEFS` 순서로 렌더하므로, 사용자가 "+"로 무엇을 언제 켜든 기본 5개는
 * 종류 → 신용등급 → 표면이율 → 만기일 → 수익률 자리를 지킨다.
 */
export const SCREENER_FILTER_IDS = [
  "q",
  "kinds",
  "grades",
  "srfcInrt",
  "exprDt",
  "clprBnfRt",
  "intTcds",
  "markets",
  "issuDt",
  "bal",
  "clprPrc",
  "clprVs",
  "trqu",
] as const;

export type ScreenerFilterId = (typeof SCREENER_FILTER_IDS)[number];

interface FilterDefBase {
  id: ScreenerFilterId;
  /** 칩 트리거와 "+" 피커에 쓰는 한국어 라벨. */
  label: string;
  /** `"search"`인 항목(`q`)은 칩이 아니라 검색창으로 렌더되고 "+" 피커에 나타나지 않는다. */
  placement: "chip" | "search";
  /**
   * 시세 테이블에서 오는 필드 표시. 시세 행이 없는 종목은 `mrktCtg`·`clprPrc`·`clprVs`·
   * `clprBnfRt`·`trqu`가 **동시에** null이라, 이 필터를 켜면 그 종목이 통째로 빠진다.
   * 팝오버에 안내 문구를 띄우는 근거.
   */
  priceDerived?: true;
  /** 대응하는 표 컬럼 id(있는 경우). 표시용 메타 + 컬럼 목록과의 동기화 테스트용. */
  columnId?: string;
}

export interface TextFilterDef extends FilterDefBase {
  kind: "text";
  valueKey: TextValueKey;
  /** 부분일치 대상. 여러 컬럼을 이어붙여도 된다. */
  getText: (row: ScreenerRow) => string;
  placeholder: string;
}

export interface MultiFilterDef extends FilterDefBase {
  kind: "multi";
  valueKey: MultiValueKey;
  /**
   * **비교 대상은 라벨이 아니라 코드다.** 표 컬럼 id는 `scrsItmsKcdNm`(라벨)인데 필터가
   * 보는 값은 `scrsItmsKcd`(코드)라서, 여기서 `getLabel`과 바꿔 쓰면 선택은 되는데
   * 아무것도 걸러지지 않는 버그가 된다.
   */
  getCode: (row: ScreenerRow) => string | null;
  getLabel: (row: ScreenerRow) => string | null;
  optionSort: "grade" | "count";
  /** 주어지면 이 목록·이 순서로 제한한다(`optionSort`보다 우선). 목록 밖의 값은 버린다. */
  optionOrder?: readonly string[];
}

export interface RangeFilterDef extends FilterDefBase {
  kind: "range";
  minKey: RangeBoundKey;
  maxKey: RangeBoundKey;
  getValue: (row: ScreenerRow) => number | null;
  /** `"amount"`는 조/억/만/원 단위 선택기를 붙인다(저장값은 언제나 원 단위). */
  inputType: "number" | "date" | "amount";
  step?: number;
}

export type ScreenerFilterDef = TextFilterDef | MultiFilterDef | RangeFilterDef;

/**
 * `as const satisfies`를 쓰지 않는다 — 화살표 함수가 담긴 배열에 붙이면 `getCode`/
 * `getValue` 파라미터의 문맥 타이핑이 깨져 `row`가 암묵적 any가 된다.
 */
export const SEARCH_FILTER_DEF: TextFilterDef = {
  id: "q",
  label: "검색",
  placement: "search",
  kind: "text",
  valueKey: "q",
  // 결합 순서를 바꾸지 말 것 — 종목명·발행인·ISIN을 한 문자열로 이어 부분일치를 본다.
  getText: (row) => `${row.isinCdNm ?? ""} ${row.bondIsurNm ?? ""} ${row.isinCd}`,
  placeholder: "종목명·발행인·ISIN 검색",
};

export const SCREENER_FILTER_DEFS: readonly ScreenerFilterDef[] = [
  SEARCH_FILTER_DEF,
  {
    id: "kinds",
    label: "종류",
    placement: "chip",
    columnId: "scrsItmsKcdNm",
    kind: "multi",
    valueKey: "kinds",
    getCode: (row) => row.scrsItmsKcd,
    getLabel: (row) => row.scrsItmsKcdNm,
    optionSort: "count",
  },
  {
    id: "grades",
    label: "신용등급",
    placement: "chip",
    columnId: "kisGrade",
    kind: "multi",
    valueKey: "grades",
    getCode: (row) => row.kisGrade,
    getLabel: (row) => row.kisGrade,
    optionSort: "grade",
  },
  {
    id: "srfcInrt",
    label: "표면이율(%)",
    placement: "chip",
    columnId: "bondSrfcInrt",
    kind: "range",
    minKey: "srfcInrtMin",
    maxKey: "srfcInrtMax",
    getValue: (row) => row.bondSrfcInrt,
    inputType: "number",
    step: 0.001,
  },
  {
    id: "exprDt",
    label: "만기일",
    placement: "chip",
    columnId: "bondExprDt",
    kind: "range",
    minKey: "exprDtFrom",
    maxKey: "exprDtTo",
    getValue: (row) => row.bondExprDt,
    inputType: "date",
  },
  {
    id: "clprBnfRt",
    label: "수익률(%)",
    placement: "chip",
    columnId: "clprBnfRt",
    priceDerived: true,
    kind: "range",
    minKey: "clprBnfRtMin",
    maxKey: "clprBnfRtMax",
    getValue: (row) => row.clprBnfRt,
    inputType: "number",
    step: 0.001,
  },
  {
    id: "intTcds",
    label: "이자유형",
    placement: "chip",
    columnId: "bondIntTcdNm",
    kind: "multi",
    valueKey: "intTcds",
    getCode: (row) => row.bondIntTcd,
    getLabel: (row) => row.bondIntTcdNm,
    optionSort: "count",
  },
  {
    // mrktCtg는 값 자체가 "KTS"/"일반채권"/"소액채권" 라벨이라 코드와 라벨이 같다.
    // 표에는 컬럼이 없다(필터 전용).
    id: "markets",
    label: "시장구분",
    placement: "chip",
    priceDerived: true,
    kind: "multi",
    valueKey: "markets",
    getCode: (row) => row.mrktCtg,
    getLabel: (row) => row.mrktCtg,
    optionSort: "count",
    optionOrder: BOND_MARKET_CATEGORIES,
  },
  {
    id: "issuDt",
    label: "발행일",
    placement: "chip",
    columnId: "bondIssuDt",
    kind: "range",
    minKey: "issuDtFrom",
    maxKey: "issuDtTo",
    getValue: (row) => row.bondIssuDt,
    inputType: "date",
  },
  {
    // 스냅샷에 실려 오지만 표 컬럼은 없다 — 값 확인은 상세 페이지에서 한다.
    id: "bal",
    label: "채권잔액",
    placement: "chip",
    kind: "range",
    minKey: "balMin",
    maxKey: "balMax",
    getValue: (row) => row.bondBal,
    inputType: "amount",
  },
  {
    id: "clprPrc",
    label: "종가",
    placement: "chip",
    columnId: "clprPrc",
    priceDerived: true,
    kind: "range",
    minKey: "clprPrcMin",
    maxKey: "clprPrcMax",
    getValue: (row) => row.clprPrc,
    inputType: "number",
    step: 1,
  },
  {
    id: "clprVs",
    label: "전일대비",
    placement: "chip",
    columnId: "clprVs",
    priceDerived: true,
    kind: "range",
    minKey: "clprVsMin",
    maxKey: "clprVsMax",
    getValue: (row) => row.clprVs,
    inputType: "number",
    step: 1,
  },
  {
    id: "trqu",
    label: "거래량",
    placement: "chip",
    columnId: "trqu",
    priceDerived: true,
    kind: "range",
    minKey: "trquMin",
    maxKey: "trquMax",
    getValue: (row) => row.trqu,
    inputType: "amount",
  },
];

/** 칩으로 그려지는 def만. 이 순서가 화면 표시 순서이자 "+" 피커의 목록 순서다. */
export const CHIP_FILTER_DEFS: readonly ScreenerFilterDef[] = SCREENER_FILTER_DEFS.filter(
  (def) => def.placement === "chip",
);

/** 처음 보이는 칩. 사용자가 "+"로 켜고 끈 결과는 저장하지 않는다(세션 내 메모리에만 있다). */
export const DEFAULT_VISIBLE_FILTER_IDS: readonly ScreenerFilterId[] = [
  "kinds",
  "grades",
  "srfcInrt",
  "exprDt",
  "clprBnfRt",
];

export function isFilterActive(def: ScreenerFilterDef, filters: ScreenerFilters): boolean {
  switch (def.kind) {
    case "text":
      return filters[def.valueKey].trim() !== "";
    case "multi":
      return filters[def.valueKey].length > 0;
    case "range":
      return filters[def.minKey] !== null || filters[def.maxKey] !== null;
  }
}

/**
 * def가 쓰는 키만 기본값으로 되돌린다.
 *
 * `{ ...filters, [def.valueKey]: [] }` 형태는 쓸 수 없다 — computed key가 인덱스
 * 시그니처로 넓어져 `ScreenerFilters`로 타입 체크되지 않는다. 아래처럼 복사 후 대입하면
 * 유니온 키 쓰기가 값 타입의 교집합(`string[] & string[]` 등)을 요구하므로 통과한다.
 */
export function clearFilter(def: ScreenerFilterDef, filters: ScreenerFilters): ScreenerFilters {
  const next: ScreenerFilters = { ...filters };
  switch (def.kind) {
    case "text":
      next[def.valueKey] = "";
      break;
    case "multi":
      next[def.valueKey] = [];
      break;
    case "range":
      next[def.minKey] = null;
      next[def.maxKey] = null;
      break;
  }
  return next;
}

/** `clearFilter`와 같은 2단계 대입 규칙(위 주석 참고). */
export function setMultiValue(def: MultiFilterDef, filters: ScreenerFilters, next: string[]): ScreenerFilters {
  const result: ScreenerFilters = { ...filters };
  result[def.valueKey] = next;
  return result;
}

/** 같은 규칙. min/max를 한 번에 바꾼다(범위 입력은 둘을 함께 통보한다). */
export function setRangeValue(
  def: RangeFilterDef,
  filters: ScreenerFilters,
  min: number | null,
  max: number | null,
): ScreenerFilters {
  const result: ScreenerFilters = { ...filters };
  result[def.minKey] = min;
  result[def.maxKey] = max;
  return result;
}

/**
 * 표시할 칩 id를 정한다 — 사용자가 켜 둔 것 + **값이 들어있는 것**의 합집합.
 *
 * 후자가 핵심이다. 칩 구성은 URL에 저장하지 않으므로, URL/sessionStorage 복원이나
 * 프리셋 적용으로 값만 들어오는 경로가 존재한다. 이 합집합이 없으면 "값은 걸려 있는데
 * 칩이 없어서 해제할 수 없는" 상태가 만들어진다.
 *
 * 추가할 게 없으면 `visible`을 **그대로(동일 참조로)** 돌려준다 — 검색어 타건마다
 * 새 배열이 나오면 칩이 통째로 리렌더된다. 순서는 여기서 정하지 않는다(호출부가
 * `CHIP_FILTER_DEFS`를 필터링하므로 언제나 레지스트리 순서다).
 */
export function resolveVisibleFilterIds(
  visible: readonly ScreenerFilterId[],
  filters: ScreenerFilters,
): readonly ScreenerFilterId[] {
  const revealed = CHIP_FILTER_DEFS.filter((def) => !visible.includes(def.id) && isFilterActive(def, filters));
  if (revealed.length === 0) return visible;
  return [...visible, ...revealed.map((def) => def.id)];
}
