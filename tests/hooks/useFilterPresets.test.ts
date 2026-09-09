/**
 * `src/hooks/useFilterPresets.ts` 전용. 순수 조작 함수(`src/lib/screener/presets.ts`)는
 * `tests/screener-presets.test.ts`가 덮으므로, 여기서는 **훅이 추가하는 것**만 본다:
 * 마운트 시점 복원, 상태와 localStorage의 동시 갱신, 스토리지 접근 실패 시의 생존.
 *
 * `tests/setup-browser.ts`의 afterEach가 매 테스트 후 localStorage를 비운다.
 */
import { describe, expect, test } from "vitest";
import { renderHook } from "vitest-browser-react";
import { useFilterPresets } from "@/hooks/useFilterPresets";
import { PRESETS_STORAGE_KEY, parsePresets, serializePresets, type FilterPreset } from "@/lib/screener/presets";

function seed(presets: FilterPreset[]): void {
  localStorage.setItem(PRESETS_STORAGE_KEY, serializePresets(presets));
}

function stored(): FilterPreset[] {
  return parsePresets(localStorage.getItem(PRESETS_STORAGE_KEY));
}

const SAVED: FilterPreset = { id: "seed-1", name: "국채 단기물", query: "q=국채", createdAt: 1 };

describe("마운트 복원", () => {
  test("localStorage에 저장된 목록을 복원한다", async () => {
    seed([SAVED]);

    const { result } = await renderHook(() => useFilterPresets());

    expect(result.current.presets).toEqual([SAVED]);
  });

  test("저장된 값이 없으면 빈 목록으로 시작하고 스토리지에 쓰지도 않는다", async () => {
    const { result } = await renderHook(() => useFilterPresets());

    expect(result.current.presets).toEqual([]);
    expect(localStorage.getItem(PRESETS_STORAGE_KEY)).toBeNull();
  });

  test("저장된 값이 깨져 있으면 빈 목록으로 폴백한다", async () => {
    localStorage.setItem(PRESETS_STORAGE_KEY, "{망가진 JSON");

    const { result } = await renderHook(() => useFilterPresets());

    expect(result.current.presets).toEqual([]);
  });
});

describe("저장·삭제", () => {
  test("savePreset이 상태와 localStorage를 함께 갱신한다", async () => {
    const { result, act } = await renderHook(() => useFilterPresets());

    await act(() => {
      result.current.savePreset("  고금리  ", "srfcInrtMin=5");
    });

    expect(result.current.presets).toHaveLength(1);
    expect(result.current.presets[0]?.name).toBe("고금리");
    expect(result.current.presets[0]?.query).toBe("srfcInrtMin=5");
    expect(stored()).toEqual(result.current.presets);
  });

  test("같은 이름으로 저장하면 항목이 늘지 않고 query만 바뀐다", async () => {
    seed([SAVED]);
    const { result, act } = await renderHook(() => useFilterPresets());

    await act(() => {
      result.current.savePreset(SAVED.name, "q=바뀜");
    });

    expect(result.current.presets).toHaveLength(1);
    expect(result.current.presets[0]?.id).toBe(SAVED.id);
    expect(result.current.presets[0]?.query).toBe("q=바뀜");
    expect(stored()[0]?.query).toBe("q=바뀜");
  });

  test("deletePreset이 상태와 localStorage에서 함께 지운다", async () => {
    seed([SAVED]);
    const { result, act } = await renderHook(() => useFilterPresets());

    await act(() => {
      result.current.deletePreset(SAVED.id);
    });

    expect(result.current.presets).toEqual([]);
    expect(stored()).toEqual([]);
  });
});

test("localStorage 접근이 throw해도(프라이빗 모드 등) 훅은 정상 동작한다", async () => {
  const original = Object.getOwnPropertyDescriptor(window, "localStorage");
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() {
      throw new Error("blocked");
    },
  });

  try {
    const { result, act } = await renderHook(() => useFilterPresets());
    expect(result.current.presets).toEqual([]);

    // 스토리지에 남기지는 못해도 이번 세션의 목록은 살아 있어야 한다.
    await act(() => {
      result.current.savePreset("임시", "q=a");
    });
    expect(result.current.presets).toHaveLength(1);
  } finally {
    if (original) Object.defineProperty(window, "localStorage", original);
  }
});
