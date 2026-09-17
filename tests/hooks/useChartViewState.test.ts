/**
 * `src/hooks/useChartViewState.ts` 전용. 순수 encode/decode(`src/lib/bond/chart-view-state.ts`)는
 * `tests/bond-chart-view-state.test.ts`가 이미 덮으므로, 여기서는 **훅이 추가하는 것**만 본다:
 * 마운트 시점 URL 복원(+ `restored` 플래그), `history.replaceState` 동기화, sessionStorage를
 * 쓰지 않는다는 것.
 *
 * `tests/setup-browser.ts`의 afterEach가 매 테스트 후 URL을 원상복구한다.
 */
import { describe, expect, test } from "vitest";
import { renderHook } from "vitest-browser-react";
import { encodeChartViewState } from "@/lib/bond/chart-view-state";
import { useChartViewState } from "@/hooks/useChartViewState";

const AVAILABLE_MARKETS = ["KTS", "일반채권"] as const;
const DEFAULT_MARKET = "일반채권" as const;

describe("마운트 복원", () => {
  test("URL에 쿼리가 없으면 defaultMarket + 기본 기간/지표를 유지한다", async () => {
    window.history.replaceState(null, "", window.location.pathname);
    const { result } = await renderHook(() => useChartViewState(AVAILABLE_MARKETS, DEFAULT_MARKET));

    expect(result.current.state).toEqual({ market: DEFAULT_MARKET, preset: "1Y", metric: "price" });
    expect(result.current.restored).toBe(true);
    expect(window.location.search).toBe("");
  });

  test("URL 쿼리가 있으면 그 값으로 복원된다", async () => {
    window.history.replaceState(null, "", `${window.location.pathname}?market=KTS&range=3M&metric=yield`);
    const { result } = await renderHook(() => useChartViewState(AVAILABLE_MARKETS, DEFAULT_MARKET));

    expect(result.current.state).toEqual({ market: "KTS", preset: "3M", metric: "yield" });
  });

  test("존재하지 않는 시장은 defaultMarket으로 폴백한다", async () => {
    window.history.replaceState(null, "", `${window.location.pathname}?market=소액채권`);
    const { result } = await renderHook(() => useChartViewState(AVAILABLE_MARKETS, DEFAULT_MARKET));

    expect(result.current.state.market).toBe(DEFAULT_MARKET);
  });

  test("sessionStorage에 값이 있어도 읽지 않는다 — 상세는 종목별 화면이라 세션 폴백이 없다", async () => {
    window.history.replaceState(null, "", window.location.pathname);
    sessionStorage.setItem("bond-screener:chart-view-state", "range=3M");

    const { result } = await renderHook(() => useChartViewState(AVAILABLE_MARKETS, DEFAULT_MARKET));

    expect(result.current.state.preset).toBe("1Y");
  });
});

describe("상태 변경", () => {
  test("setMarket/setPreset/setMetric이 URL을 encodeChartViewState 출력과 일치시킨다", async () => {
    const { result, act } = await renderHook(() => useChartViewState(AVAILABLE_MARKETS, DEFAULT_MARKET));

    await act(() => {
      result.current.setPreset("3Y");
    });
    expect(window.location.search.replace(/^\?/, "")).toBe(encodeChartViewState(result.current.state, DEFAULT_MARKET));

    await act(() => {
      result.current.setMetric("yield");
    });
    expect(window.location.search.replace(/^\?/, "")).toBe(encodeChartViewState(result.current.state, DEFAULT_MARKET));

    await act(() => {
      result.current.setMarket("KTS");
    });
    expect(result.current.state).toEqual({ market: "KTS", preset: "3Y", metric: "yield" });
    expect(window.location.search.replace(/^\?/, "")).toBe(encodeChartViewState(result.current.state, DEFAULT_MARKET));
  });

  test("defaultMarket과 같은 값으로 되돌리면 market= 파라미터가 URL에서 사라진다", async () => {
    const { result, act } = await renderHook(() => useChartViewState(AVAILABLE_MARKETS, DEFAULT_MARKET));

    await act(() => {
      result.current.setMarket("KTS");
    });
    expect(window.location.search).toContain("market=KTS");

    await act(() => {
      result.current.setMarket(DEFAULT_MARKET);
    });
    expect(window.location.search).not.toContain("market=");
  });

  test("pushState가 아니라 replaceState를 쓴다 — 연속 변경 후에도 history.length가 늘지 않는다", async () => {
    const before = window.history.length;
    const { result, act } = await renderHook(() => useChartViewState(AVAILABLE_MARKETS, DEFAULT_MARKET));

    await act(() => {
      result.current.setPreset("3M");
    });
    await act(() => {
      result.current.setMetric("yield");
    });
    await act(() => {
      result.current.setMarket("KTS");
    });

    expect(window.history.length).toBe(before);
  });
});
