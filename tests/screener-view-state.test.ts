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

  // 레지스트리 도입 전에 만들어진 링크·저장된 프리셋이 그대로 살아야 한다.
  // 파라미터 이름 = ScreenerFilters 키라는 동일성이 그 하위호환의 전부다.
  test("레지스트리 도입 전 쿼리스트링이 그대로 디코딩된다", () => {
    const legacy = "q=%EC%82%BC%EC%84%B1&grades=AAA%2CAA%2B&kinds=02&exprDtTo=20301231&srfcInrtMin=1&sort=kisGrade:asc";
    const result = decodeViewState(legacy);
    expect(result.filters).toEqual({
      ...EMPTY_FILTERS,
      q: "삼성",
      grades: ["AAA", "AA+"],
      kinds: ["02"],
      exprDtTo: 20301231,
      srfcInrtMin: 1,
    });
    expect(result.sorting).toEqual([{ id: "kisGrade", desc: false }]);
  });

  test("새로 추가된 필터 파라미터를 읽는다", () => {
    const result = decodeViewState("issuDtFrom=20200101&balMin=100000000&clprPrcMax=10500&clprVsMin=-50&trquMin=0");
    expect(result.filters).toMatchObject({
      issuDtFrom: 20200101,
      balMin: 100000000,
      clprPrcMax: 10500,
      clprVsMin: -50,
      trquMin: 0,
    });
  });

  test("칩 구성은 URL에 저장하지 않는다", () => {
    // 보이는 칩 목록은 ScreenerFilterBar의 로컬 상태다 — 뷰 상태에 새 필드가 생기면
    // 프리셋·sessionStorage 포맷까지 번지므로 의도적으로 넣지 않았다.
    expect(Object.keys(decodeViewState("")).sort()).toEqual(["filters", "pageIndex", "pageSize", "sorting"]);
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
        clprBnfRtMin: 2,
        clprBnfRtMax: 4,
        issuDtFrom: 20200101,
        issuDtTo: 20240101,
        balMin: 100_000_000,
        balMax: 5_000_000_000,
        clprPrcMin: 9000,
        clprPrcMax: 11000,
        clprVsMin: -100,
        clprVsMax: 100,
        trquMin: 0,
        trquMax: 1_000_000,
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
