/**
 * `src/lib/screener/presets.ts`의 순수 로직 전용. 프리셋 쿼리의 인코딩 규약(필터+정렬만,
 * 페이지 상태 제외)과 localStorage 파싱의 관용적 폴백, 목록 조작 규칙을 고정한다.
 * 훅(스토리지 접근)은 `tests/hooks/useFilterPresets.test.ts`, UI는
 * `tests/components/screener/ScreenerPresetMenu.test.tsx`가 덮는다.
 */
import { describe, expect, test } from "vitest";
import { EMPTY_FILTERS } from "@/lib/screener/filters";
import { DEFAULT_VIEW_STATE } from "@/lib/screener/view-state";
import {
  MAX_PRESETS,
  MAX_PRESET_NAME_LENGTH,
  decodePresetQuery,
  encodePresetQuery,
  findPresetByName,
  normalizePresetName,
  parsePresets,
  removePreset,
  serializePresets,
  upsertPreset,
  type FilterPreset,
} from "@/lib/screener/presets";

function makePreset(overrides: Partial<FilterPreset> = {}): FilterPreset {
  return { id: crypto.randomUUID(), name: "프리셋", query: "q=a", createdAt: 1, ...overrides };
}

describe("encodePresetQuery / decodePresetQuery", () => {
  test("필터와 정렬만 싣고 page·size는 싣지 않는다", () => {
    const query = encodePresetQuery({
      filters: { ...EMPTY_FILTERS, q: "삼성", grades: ["AA0"] },
      sorting: [{ id: "clprPrc", desc: false }],
    });

    const params = new URLSearchParams(query);
    expect(params.get("q")).toBe("삼성");
    expect(params.get("grades")).toBe("AA0");
    expect(params.get("sort")).toBe("clprPrc:asc");
    expect(params.has("page")).toBe(false);
    expect(params.has("size")).toBe(false);
  });

  test("기본 필터 + 기본 정렬이면 빈 문자열이 된다", () => {
    expect(encodePresetQuery({ filters: EMPTY_FILTERS, sorting: DEFAULT_VIEW_STATE.sorting })).toBe("");
  });

  test("왕복해도 필터·정렬이 보존된다", () => {
    const slice = {
      filters: { ...EMPTY_FILTERS, bondBalMin: 1_000_000_000, exprDtTo: 20301231 },
      sorting: [{ id: "bondBal", desc: true }],
    };
    expect(decodePresetQuery(encodePresetQuery(slice))).toEqual(slice);
  });

  test("오염된 쿼리는 throw하지 않고 기본값으로 폴백한다(decodeViewState 재사용)", () => {
    const { filters, sorting } = decodePresetQuery("srfcInrtMin=아무거나&sort=존재하지않는컬럼:desc");
    expect(filters.srfcInrtMin).toBeNull();
    expect(sorting).toEqual(DEFAULT_VIEW_STATE.sorting);
  });

  test("디코드 결과에는 페이지 상태가 없다", () => {
    expect(Object.keys(decodePresetQuery("q=a")).sort()).toEqual(["filters", "sorting"]);
  });
});

describe("normalizePresetName", () => {
  test("앞뒤 공백을 없애고 최대 길이로 자른다", () => {
    expect(normalizePresetName("  국채 단기물  ")).toBe("국채 단기물");
    expect(normalizePresetName("가".repeat(100))).toHaveLength(MAX_PRESET_NAME_LENGTH);
  });
});

describe("upsertPreset", () => {
  test("새 이름은 맨 앞에 추가된다", () => {
    const existing = makePreset({ name: "기존" });
    const next = upsertPreset([existing], "신규", "q=b");

    expect(next).toHaveLength(2);
    expect(next[0]?.name).toBe("신규");
    expect(next[0]?.query).toBe("q=b");
    expect(next[1]).toBe(existing);
  });

  test("이름은 trim해서 저장한다", () => {
    expect(upsertPreset([], "  국채  ", "")[0]?.name).toBe("국채");
  });

  test("같은 이름이면 순서·id를 유지한 채 query만 교체한다", () => {
    const first = makePreset({ name: "첫째", query: "q=1" });
    const second = makePreset({ name: "둘째", query: "q=2" });

    const next = upsertPreset([first, second], "둘째", "q=changed");

    expect(next).toHaveLength(2);
    expect(next[0]).toBe(first);
    expect(next[1]?.id).toBe(second.id);
    expect(next[1]?.query).toBe("q=changed");
  });

  test("동명 판정은 공백·대소문자를 무시한다", () => {
    const existing = makePreset({ name: "Short Term" });
    const next = upsertPreset([existing], "  short term ", "q=changed");

    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe(existing.id);
    // 새로 입력한 표기가 이름으로 반영된다.
    expect(next[0]?.name).toBe("short term");
  });

  test("이름이 공백뿐이면 목록을 그대로 돌려준다", () => {
    const list = [makePreset()];
    expect(upsertPreset(list, "   ", "q=b")).toBe(list);
  });

  test("MAX_PRESETS를 넘으면 가장 오래된 것부터 밀려난다", () => {
    let list: FilterPreset[] = [];
    for (let i = 0; i < MAX_PRESETS + 3; i++) list = upsertPreset(list, `프리셋${i}`, `q=${i}`);

    expect(list).toHaveLength(MAX_PRESETS);
    expect(list[0]?.name).toBe(`프리셋${MAX_PRESETS + 2}`);
    expect(list.at(-1)?.name).toBe("프리셋3");
  });
});

describe("removePreset / findPresetByName", () => {
  test("id로 삭제한다", () => {
    const a = makePreset({ name: "a" });
    const b = makePreset({ name: "b" });
    expect(removePreset([a, b], a.id)).toEqual([b]);
    expect(removePreset([a, b], "없는id")).toEqual([a, b]);
  });

  test("findPresetByName은 빈 이름에 대해 undefined다", () => {
    const a = makePreset({ name: "a" });
    expect(findPresetByName([a], "A")).toBe(a);
    expect(findPresetByName([a], "   ")).toBeUndefined();
  });
});

describe("parsePresets", () => {
  test("serializePresets 왕복", () => {
    const list = [makePreset({ name: "a" }), makePreset({ name: "b" })];
    expect(parsePresets(serializePresets(list))).toEqual(list);
  });

  test("null·빈 문자열·잘못된 JSON은 빈 배열", () => {
    expect(parsePresets(null)).toEqual([]);
    expect(parsePresets("")).toEqual([]);
    expect(parsePresets("{not json")).toEqual([]);
  });

  test("봉투 모양이 아니면 빈 배열 — 배열 그대로거나 version이 다른 경우 포함", () => {
    expect(parsePresets(JSON.stringify([makePreset()]))).toEqual([]);
    expect(parsePresets(JSON.stringify({ version: 99, presets: [makePreset()] }))).toEqual([]);
    expect(parsePresets(JSON.stringify({ version: 1, presets: "배열아님" }))).toEqual([]);
  });

  test("모양이 깨진 항목만 버리고 나머지는 살린다", () => {
    const good = makePreset({ name: "정상" });
    const raw = JSON.stringify({
      version: 1,
      presets: [good, { id: "x", name: "", query: "", createdAt: 1 }, { id: "y" }, null, "문자열"],
    });
    expect(parsePresets(raw)).toEqual([good]);
  });

  test("MAX_PRESETS를 넘게 저장돼 있어도 상한까지만 읽는다", () => {
    const many = Array.from({ length: MAX_PRESETS + 5 }, (_, i) => makePreset({ name: `p${i}` }));
    expect(parsePresets(serializePresets(many))).toHaveLength(MAX_PRESETS);
  });
});
