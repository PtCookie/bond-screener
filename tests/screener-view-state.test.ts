import { describe, expect, test } from "vitest";
import { EMPTY_FILTERS } from "@/lib/screener/filters";
import {
  DEFAULT_VIEW_STATE,
  decodeViewState,
  encodeViewState,
  type ScreenerViewState,
} from "@/lib/screener/view-state";

describe("DEFAULT_VIEW_STATE", () => {
  test("기본 정렬은 거래량(trqu) 내림차순이다", () => {
    expect(DEFAULT_VIEW_STATE.sorting).toEqual([{ id: "trqu", desc: true }]);
  });
});

describe("encodeViewState", () => {
  test("기본 상태를 인코딩하면 빈 쿼리스트링", () => {
    expect(encodeViewState(DEFAULT_VIEW_STATE)).toBe("");
  });

  test("기본값과 다른 항목만 쿼리에 남는다", () => {
    const state: ScreenerViewState = { ...DEFAULT_VIEW_STATE, pageIndex: 2 };
    expect(encodeViewState(state)).toBe("page=3");
  });

  test("정렬 해제 상태는 sort=none으로 명시된다", () => {
    const state: ScreenerViewState = { ...DEFAULT_VIEW_STATE, sorting: [] };
    expect(encodeViewState(state)).toBe("sort=none");
  });
});

describe("decodeViewState", () => {
  test("빈 문자열은 기본값", () => {
    expect(decodeViewState("")).toEqual(DEFAULT_VIEW_STATE);
  });

  test("미지의 정렬 컬럼은 기본 정렬로 폴백한다", () => {
    const result = decodeViewState("sort=notAColumn:desc");
    expect(result.sorting).toEqual(DEFAULT_VIEW_STATE.sorting);
  });

  test("허용되지 않은 방향값은 기본 정렬로 폴백한다", () => {
    const result = decodeViewState("sort=trqu:sideways");
    expect(result.sorting).toEqual(DEFAULT_VIEW_STATE.sorting);
  });

  test("허용되지 않은 pageSize는 기본값으로 폴백한다", () => {
    const result = decodeViewState("size=999");
    expect(result.pageSize).toBe(DEFAULT_VIEW_STATE.pageSize);
  });

  test("숫자가 아닌 범위값은 null로 폴백한다", () => {
    const result = decodeViewState("srfcInrtMin=abc");
    expect(result.filters.srfcInrtMin).toBeNull();
  });

  test("sort=none은 정렬 해제 상태로 디코딩된다", () => {
    const result = decodeViewState("sort=none");
    expect(result.sorting).toEqual([]);
  });

  test("page=0 이하는 기본값(0)으로 폴백한다", () => {
    const result = decodeViewState("page=0");
    expect(result.pageIndex).toBe(DEFAULT_VIEW_STATE.pageIndex);
  });
});

describe("round-trip", () => {
  test("decodeViewState(encodeViewState(state))가 원 상태를 복원한다", () => {
    const state: ScreenerViewState = {
      filters: {
        ...EMPTY_FILTERS,
        q: "삼성",
        grades: ["AAA", "AA+"],
        intTcds: ["01"],
        markets: ["KTS", "일반채권"],
        kinds: ["02"],
        exprDtFrom: 20250101,
        exprDtTo: 20301231,
        srfcInrtMin: 1,
        srfcInrtMax: 5.5,
        bondBalMin: 0,
        bondBalMax: 1_000_000_000,
        clprBnfRtMin: 2,
        clprBnfRtMax: 4,
      },
      sorting: [{ id: "bondExprDt", desc: false }],
      pageIndex: 3,
      pageSize: 100,
    };
    expect(decodeViewState(encodeViewState(state))).toEqual(state);
  });

  test("정렬 해제 상태(sorting: [])도 라운드트립된다", () => {
    const state: ScreenerViewState = { ...DEFAULT_VIEW_STATE, sorting: [] };
    expect(decodeViewState(encodeViewState(state))).toEqual(state);
  });

  test("기본 상태 자체도 라운드트립된다", () => {
    expect(decodeViewState(encodeViewState(DEFAULT_VIEW_STATE))).toEqual(DEFAULT_VIEW_STATE);
  });
});
