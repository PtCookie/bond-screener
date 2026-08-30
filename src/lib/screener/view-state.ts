/**
 * 필터·정렬·페이지 상태를 URL 쿼리스트링 ↔ `ScreenerViewState` 간 변환한다.
 * `useScreenerViewState.ts`가 이 인코더/디코더로 상태를 URL과 sessionStorage에 동기화해,
 * Astro MPA에서 상세 페이지를 오가도(전체 리로드가 일어나도) 뷰 상태가 살아남게 한다.
 */
import type { SortingState } from "@tanstack/react-table";
import { EMPTY_FILTERS, type ScreenerFilters } from "./filters";

export interface ScreenerViewState {
  filters: ScreenerFilters;
  sorting: SortingState;
  pageIndex: number;
  pageSize: number;
}

/** `ScreenerPagination`의 페이지 크기 선택지. 여기를 정본으로 두고 컴포넌트가 가져다 쓴다. */
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

/**
 * 정렬 가능한 컬럼 id 화이트리스트. `columns.tsx`의 `screenerColumns` accessor key와
 * 반드시 일치해야 한다 — 순환 import(view-state.ts ↔ columns.tsx)를 피하려고 상수를
 * 중복 정의했다. 컬럼을 추가/삭제할 때 함께 갱신할 것.
 */
const SORTABLE_COLUMN_IDS = new Set<string>([
  "isinCdNm",
  "bondIsurNm",
  "scrsItmsKcdNm",
  "bondIssuDt",
  "bondExprDt",
  "bondSrfcInrt",
  "kisGrade",
  "bondBal",
  "bondIntTcdNm",
  "clprPrc",
  "clprVs",
  "clprBnfRt",
  "trqu",
]);

/** 요구사항: 기본 정렬은 거래량(trqu) 내림차순. */
export const DEFAULT_VIEW_STATE: ScreenerViewState = {
  filters: EMPTY_FILTERS,
  sorting: [{ id: "trqu", desc: true }],
  pageIndex: 0,
  pageSize: 25,
};

const DEFAULT_SORT = DEFAULT_VIEW_STATE.sorting[0];

export function encodeViewState(state: ScreenerViewState): string {
  const params = new URLSearchParams();
  const { filters, sorting, pageIndex, pageSize } = state;

  const q = filters.q.trim();
  if (q !== "") params.set("q", q);
  if (filters.grades.length > 0) params.set("grades", filters.grades.join(","));
  if (filters.intTcds.length > 0) params.set("intTcds", filters.intTcds.join(","));
  if (filters.markets.length > 0) params.set("markets", filters.markets.join(","));
  if (filters.kinds.length > 0) params.set("kinds", filters.kinds.join(","));
  if (filters.exprDtFrom !== null) params.set("exprDtFrom", String(filters.exprDtFrom));
  if (filters.exprDtTo !== null) params.set("exprDtTo", String(filters.exprDtTo));
  if (filters.srfcInrtMin !== null) params.set("srfcInrtMin", String(filters.srfcInrtMin));
  if (filters.srfcInrtMax !== null) params.set("srfcInrtMax", String(filters.srfcInrtMax));
  if (filters.bondBalMin !== null) params.set("bondBalMin", String(filters.bondBalMin));
  if (filters.bondBalMax !== null) params.set("bondBalMax", String(filters.bondBalMax));
  if (filters.clprBnfRtMin !== null) params.set("clprBnfRtMin", String(filters.clprBnfRtMin));
  if (filters.clprBnfRtMax !== null) params.set("clprBnfRtMax", String(filters.clprBnfRtMax));

  // 현재 이 화면은 단일 컬럼 정렬만 쓴다(멀티소트 기능 미등록) — sorting[0]만 본다.
  const sort = sorting[0];
  const sortDiffersFromDefault =
    sort === undefined ? true : sort.id !== DEFAULT_SORT.id || sort.desc !== DEFAULT_SORT.desc;
  if (sortDiffersFromDefault) {
    params.set("sort", sort === undefined ? "none" : `${sort.id}:${sort.desc ? "desc" : "asc"}`);
  }

  if (pageIndex !== DEFAULT_VIEW_STATE.pageIndex) params.set("page", String(pageIndex + 1));
  if (pageSize !== DEFAULT_VIEW_STATE.pageSize) params.set("size", String(pageSize));

  return params.toString();
}

function parseList(raw: string | null): string[] {
  if (raw === null || raw === "") return [];
  return raw.split(",").filter((s) => s !== "");
}

/** 숫자로 해석되지 않으면(빈 값·잘못된 입력) `null`로 폴백한다 — URL은 사용자가 손댈 수 있는 입력이다. */
function parseNumericParam(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseSort(raw: string | null): SortingState {
  if (raw === null) return DEFAULT_VIEW_STATE.sorting;
  if (raw === "none") return [];
  const [id, dir] = raw.split(":");
  if (id === undefined || !SORTABLE_COLUMN_IDS.has(id)) return DEFAULT_VIEW_STATE.sorting;
  if (dir !== "asc" && dir !== "desc") return DEFAULT_VIEW_STATE.sorting;
  return [{ id, desc: dir === "desc" }];
}

/** 파싱 실패·미지의 값은 조용히 기본값으로 폴백한다(throw하지 않음). */
export function decodeViewState(input: string | URLSearchParams): ScreenerViewState {
  const params = typeof input === "string" ? new URLSearchParams(input) : input;

  const filters: ScreenerFilters = {
    q: params.get("q") ?? EMPTY_FILTERS.q,
    grades: parseList(params.get("grades")),
    intTcds: parseList(params.get("intTcds")),
    markets: parseList(params.get("markets")),
    kinds: parseList(params.get("kinds")),
    exprDtFrom: parseNumericParam(params.get("exprDtFrom")),
    exprDtTo: parseNumericParam(params.get("exprDtTo")),
    srfcInrtMin: parseNumericParam(params.get("srfcInrtMin")),
    srfcInrtMax: parseNumericParam(params.get("srfcInrtMax")),
    bondBalMin: parseNumericParam(params.get("bondBalMin")),
    bondBalMax: parseNumericParam(params.get("bondBalMax")),
    clprBnfRtMin: parseNumericParam(params.get("clprBnfRtMin")),
    clprBnfRtMax: parseNumericParam(params.get("clprBnfRtMax")),
  };

  const sorting = parseSort(params.get("sort"));

  const rawPage = params.get("page");
  const pageIndex =
    rawPage !== null && /^\d+$/.test(rawPage) && Number(rawPage) >= 1
      ? Number(rawPage) - 1
      : DEFAULT_VIEW_STATE.pageIndex;

  const rawSize = params.get("size");
  const parsedSize = rawSize !== null ? Number(rawSize) : NaN;
  const pageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsedSize)
    ? parsedSize
    : DEFAULT_VIEW_STATE.pageSize;

  return { filters, sorting, pageIndex, pageSize };
}
