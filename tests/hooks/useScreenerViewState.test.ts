/**
 * `src/hooks/useScreenerViewState.ts` 전용. 순수 encode/decode(`src/lib/screener/view-state.ts`)는
 * `tests/screener-view-state.test.ts`가 이미 덮으므로, 여기서는 **훅이 추가하는 것**만 본다:
 * 마운트 시점 복원 순서(URL 우선 → sessionStorage 폴백), `history.replaceState` 동기화,
 * 필터 변경 시 페이지 리셋(정렬/페이지네이션 변경 시에는 리셋하지 않음).
 *
 * `tests/setup-browser.ts`의 afterEach가 매 테스트 후 URL·sessionStorage를 원상복구한다.
 */
import { describe, expect, test } from "vitest";
import { renderHook } from "vitest-browser-react";
import { EMPTY_FILTERS } from "@/lib/screener/filters";
import { DEFAULT_VIEW_STATE, encodeViewState } from "@/lib/screener/view-state";
import { useScreenerViewState } from "@/hooks/useScreenerViewState";

const SESSION_STORAGE_KEY = "bond-screener:view-state";

describe("마운트 복원", () => {
  test("URL에 쿼리가 있으면 URL이 정본이고 sessionStorage는 무시한다", async () => {
    window.history.replaceState(null, "", `${window.location.pathname}?page=2`);
    sessionStorage.setItem(SESSION_STORAGE_KEY, "page=5");

    const { result } = await renderHook(() => useScreenerViewState());

    expect(result.current.state.pageIndex).toBe(1); // page=2 → pageIndex 1
  });

  test("URL이 비어 있고 sessionStorage에 값이 있으면 복원하고 주소창에도 반영한다", async () => {
    window.history.replaceState(null, "", window.location.pathname);
    sessionStorage.setItem(SESSION_STORAGE_KEY, "page=4");

    const { result } = await renderHook(() => useScreenerViewState());

    expect(result.current.state.pageIndex).toBe(3); // page=4 → pageIndex 3
    // 공유 가능성 계약: sessionStorage에서만 복원된 상태도 주소창 쿼리로 반영돼야
    // URL을 복사/공유해도 같은 상태가 재현된다.
    expect(window.location.search).toBe("?page=4");
  });

  test("URL도 sessionStorage도 비어 있으면 DEFAULT_VIEW_STATE를 유지하고 URL도 그대로다", async () => {
    window.history.replaceState(null, "", window.location.pathname);
    sessionStorage.removeItem(SESSION_STORAGE_KEY);

    const { result } = await renderHook(() => useScreenerViewState());

    expect(result.current.state).toEqual(DEFAULT_VIEW_STATE);
    expect(window.location.search).toBe("");
  });

  test("sessionStorage 접근이 throw해도(프라이빗 모드 등) 훅은 정상 동작한다", async () => {
    window.history.replaceState(null, "", `${window.location.pathname}?page=2`);
    const original = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });

    try {
      const { result } = await renderHook(() => useScreenerViewState());
      // URL이 정본인 경로라 sessionStorage 접근(읽기/쓰기 모두)이 막혀도 상태 복원은 된다.
      expect(result.current.state.pageIndex).toBe(1);
    } finally {
      if (original) Object.defineProperty(window, "sessionStorage", original);
    }
  });
});

describe("상태 변경", () => {
  test("setFilters는 pageIndex를 0으로 리셋한다", async () => {
    window.history.replaceState(null, "", `${window.location.pathname}?page=3`);
    const { result, act } = await renderHook(() => useScreenerViewState());
    expect(result.current.state.pageIndex).toBe(2);

    await act(() => {
      result.current.setFilters({ ...EMPTY_FILTERS, q: "삼성" });
    });

    expect(result.current.state.pageIndex).toBe(0);
    expect(result.current.state.filters.q).toBe("삼성");
  });

  test("setSorting은 pageIndex를 리셋하지 않는다", async () => {
    window.history.replaceState(null, "", `${window.location.pathname}?page=3`);
    const { result, act } = await renderHook(() => useScreenerViewState());
    expect(result.current.state.pageIndex).toBe(2);

    await act(() => {
      result.current.setSorting([{ id: "clprPrc", desc: false }]);
    });

    expect(result.current.state.pageIndex).toBe(2);
    expect(result.current.state.sorting).toEqual([{ id: "clprPrc", desc: false }]);
  });

  test("setPagination은 pageIndex를 리셋하지 않는다(그 자체가 페이지 이동)", async () => {
    const { result, act } = await renderHook(() => useScreenerViewState());

    await act(() => {
      result.current.setPagination({ pageIndex: 4, pageSize: 50 });
    });

    expect(result.current.state.pageIndex).toBe(4);
    expect(result.current.state.pageSize).toBe(50);
  });

  test("resetFilters는 EMPTY_FILTERS로 되돌린다", async () => {
    const { result, act } = await renderHook(() => useScreenerViewState());
    await act(() => {
      result.current.setFilters({ ...EMPTY_FILTERS, q: "삼성" });
    });
    expect(result.current.state.filters.q).toBe("삼성");

    await act(() => {
      result.current.resetFilters();
    });

    expect(result.current.state.filters).toEqual(EMPTY_FILTERS);
  });

  test("pushState가 아니라 replaceState를 쓴다 — 연속 변경 후에도 history.length가 늘지 않는다", async () => {
    const before = window.history.length;
    const { result, act } = await renderHook(() => useScreenerViewState());

    await act(() => {
      result.current.setFilters({ ...EMPTY_FILTERS, q: "a" });
    });
    await act(() => {
      result.current.setSorting([{ id: "clprPrc", desc: false }]);
    });
    await act(() => {
      result.current.setPagination({ pageIndex: 1, pageSize: 25 });
    });

    expect(window.history.length).toBe(before);
  });

  test("URL 쿼리가 encodeViewState 출력과 일치한다", async () => {
    const { result, act } = await renderHook(() => useScreenerViewState());

    await act(() => {
      result.current.setFilters({ ...EMPTY_FILTERS, q: "테스트" });
    });

    const expectedQuery = encodeViewState(result.current.state);
    expect(window.location.search.replace(/^\?/, "")).toBe(expectedQuery);
  });
});
