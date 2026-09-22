import { describe, expect, test } from "vitest";
import {
  CHIP_FILTER_DEFS,
  DEFAULT_VISIBLE_FILTER_IDS,
  SCREENER_FILTER_DEFS,
  SCREENER_FILTER_IDS,
  SEARCH_FILTER_DEF,
  clearFilter,
  isFilterActive,
  resolveVisibleFilterIds,
  setMultiValue,
  setRangeValue,
  type MultiFilterDef,
  type RangeFilterDef,
  type ScreenerFilterDef,
} from "@/lib/screener/filter-defs";
import { EMPTY_FILTERS } from "@/lib/screener/filters";
import { SORTABLE_COLUMN_IDS } from "@/lib/screener/view-state";

function keysOf(def: ScreenerFilterDef): string[] {
  switch (def.kind) {
    case "text":
    case "multi":
      return [def.valueKey];
    case "range":
      return [def.minKey, def.maxKey];
  }
}

function defById(id: string): ScreenerFilterDef {
  const def = SCREENER_FILTER_DEFS.find((d) => d.id === id);
  if (def === undefined) throw new Error(`def not found: ${id}`);
  return def;
}

describe("레지스트리와 ScreenerFilters의 정합성", () => {
  // 이 테스트가 레지스트리가 인터페이스에서 표류하는 것을 막는 유일한 방어선이다 —
  // 키를 추가하고 def를 깜빡하면(혹은 그 반대) 여기서 걸린다.
  test("모든 def가 쓰는 키와 ScreenerFilters의 키 집합이 양방향으로 일치한다", () => {
    const claimed = SCREENER_FILTER_DEFS.flatMap(keysOf).sort();
    const declared = Object.keys(EMPTY_FILTERS).sort();
    expect(claimed).toEqual(declared);
  });

  test("한 키를 두 def가 공유하지 않는다", () => {
    const claimed = SCREENER_FILTER_DEFS.flatMap(keysOf);
    expect(new Set(claimed).size).toBe(claimed.length);
  });

  test("def id 목록이 SCREENER_FILTER_IDS와 같고 중복이 없다", () => {
    const ids = SCREENER_FILTER_DEFS.map((d) => d.id);
    expect(ids).toEqual([...SCREENER_FILTER_IDS]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // view-state.ts의 "컬럼을 추가/삭제할 때 함께 갱신할 것" 주석에 처음으로 강제력을 준다.
  test("def가 참조하는 columnId는 모두 정렬 가능 컬럼 화이트리스트에 있다", () => {
    const columnIds = SCREENER_FILTER_DEFS.map((d) => d.columnId).filter((id) => id !== undefined);
    expect(columnIds.length).toBeGreaterThan(0);
    for (const columnId of columnIds) {
      expect(SORTABLE_COLUMN_IDS.has(columnId)).toBe(true);
    }
  });

  test("검색 def는 q 하나뿐이고 칩 목록에 포함되지 않는다", () => {
    expect(SEARCH_FILTER_DEF.id).toBe("q");
    expect(SCREENER_FILTER_DEFS.filter((d) => d.placement === "search")).toHaveLength(1);
    expect(CHIP_FILTER_DEFS.map((d) => d.id)).not.toContain("q");
  });
});

describe("칩 표시 순서", () => {
  // 사용자가 "+"로 무엇을 언제 켜든 기본 5개는 이 순서를 지켜야 한다.
  test("CHIP_FILTER_DEFS의 앞 5개가 종류·신용등급·표면이율·만기일·수익률 순서다", () => {
    expect(CHIP_FILTER_DEFS.slice(0, 5).map((d) => d.id)).toEqual([
      "kinds",
      "grades",
      "srfcInrt",
      "exprDt",
      "clprBnfRt",
    ]);
  });

  test("기본 노출 목록이 그 5개와 같은 순서다", () => {
    expect([...DEFAULT_VISIBLE_FILTER_IDS]).toEqual(["kinds", "grades", "srfcInrt", "exprDt", "clprBnfRt"]);
  });

  test("기본 노출 def는 전부 칩이다", () => {
    for (const id of DEFAULT_VISIBLE_FILTER_IDS) {
      expect(defById(id).placement).toBe("chip");
    }
  });
});

describe("isFilterActive", () => {
  test("빈 필터에서는 모든 def가 비활성이다", () => {
    for (const def of SCREENER_FILTER_DEFS) {
      expect(isFilterActive(def, EMPTY_FILTERS)).toBe(false);
    }
  });

  test("공백만 있는 검색어는 비활성이다", () => {
    expect(isFilterActive(SEARCH_FILTER_DEF, { ...EMPTY_FILTERS, q: "   " })).toBe(false);
  });

  test("범위는 min·max 중 하나만 있어도 활성이다", () => {
    const def = defById("trqu");
    expect(isFilterActive(def, { ...EMPTY_FILTERS, trquMax: 100 })).toBe(true);
  });

  test("범위 경계값 0도 활성으로 친다 (0 !== null)", () => {
    expect(isFilterActive(defById("srfcInrt"), { ...EMPTY_FILTERS, srfcInrtMin: 0 })).toBe(true);
  });
});

describe("clearFilter / setMultiValue / setRangeValue", () => {
  test("clearFilter는 해당 def의 키만 비우고 나머지는 그대로 둔다", () => {
    const filters = { ...EMPTY_FILTERS, grades: ["AAA"], trquMin: 10, trquMax: 20 };
    expect(clearFilter(defById("trqu"), filters)).toEqual({ ...filters, trquMin: null, trquMax: null });
  });

  test("clearFilter는 다중선택을 빈 배열로, 검색어를 빈 문자열로 되돌린다", () => {
    expect(clearFilter(defById("grades"), { ...EMPTY_FILTERS, grades: ["AAA"] }).grades).toEqual([]);
    expect(clearFilter(SEARCH_FILTER_DEF, { ...EMPTY_FILTERS, q: "삼성" }).q).toBe("");
  });

  test("clearFilter는 원본을 변형하지 않는다", () => {
    const filters = { ...EMPTY_FILTERS, grades: ["AAA"] };
    clearFilter(defById("grades"), filters);
    expect(filters.grades).toEqual(["AAA"]);
  });

  test("setMultiValue / setRangeValue가 def가 가리키는 키에 쓴다", () => {
    const multi = setMultiValue(defById("kinds") as MultiFilterDef, EMPTY_FILTERS, ["1101"]);
    expect(multi.kinds).toEqual(["1101"]);

    const range = setRangeValue(defById("bal") as RangeFilterDef, EMPTY_FILTERS, 1e8, null);
    expect(range).toMatchObject({ balMin: 1e8, balMax: null });
  });
});

describe("resolveVisibleFilterIds", () => {
  test("값이 없으면 입력을 그대로(동일 참조로) 돌려준다", () => {
    // 검색어 타건마다 새 배열이 나오면 칩이 통째로 리렌더된다.
    const visible = DEFAULT_VISIBLE_FILTER_IDS;
    expect(resolveVisibleFilterIds(visible, EMPTY_FILTERS)).toBe(visible);
  });

  test("숨겨져 있어도 값이 들어있는 필터는 드러낸다", () => {
    const result = resolveVisibleFilterIds(DEFAULT_VISIBLE_FILTER_IDS, { ...EMPTY_FILTERS, intTcds: ["01"] });
    expect(result).toContain("intTcds");
  });

  test("이미 보이는 필터를 중복으로 추가하지 않는다", () => {
    const result = resolveVisibleFilterIds(DEFAULT_VISIBLE_FILTER_IDS, { ...EMPTY_FILTERS, grades: ["AAA"] });
    expect(result).toBe(DEFAULT_VISIBLE_FILTER_IDS);
  });

  test("칩이 아닌 검색(q)은 값이 있어도 드러내지 않는다", () => {
    const result = resolveVisibleFilterIds(DEFAULT_VISIBLE_FILTER_IDS, { ...EMPTY_FILTERS, q: "삼성" });
    expect(result).not.toContain("q");
  });

  test("여러 개가 동시에 드러난다", () => {
    const result = resolveVisibleFilterIds([], {
      ...EMPTY_FILTERS,
      markets: ["KTS"],
      balMin: 1e8,
    });
    expect([...result].sort()).toEqual(["bal", "markets"]);
  });
});
