import { describe, expect, test } from "vitest";
import {
  DEFAULT_CHART_VIEW_STATE,
  decodeChartViewState,
  encodeChartViewState,
  type ChartViewState,
} from "@/lib/bond/chart-view-state";

const DEFAULT_MARKET = "일반채권" as const;
const AVAILABLE_MARKETS = ["KTS", "일반채권"] as const;

function defaultState(): ChartViewState {
  return { market: DEFAULT_MARKET, ...DEFAULT_CHART_VIEW_STATE };
}

describe("encodeChartViewState", () => {
  test("기본 상태(defaultMarket과 동일)를 인코딩하면 빈 쿼리스트링", () => {
    expect(encodeChartViewState(defaultState(), DEFAULT_MARKET)).toBe("");
  });

  test("defaultMarket과 다른 시장만 market= 파라미터로 남는다", () => {
    const state: ChartViewState = { ...defaultState(), market: "KTS" };
    expect(encodeChartViewState(state, DEFAULT_MARKET)).toBe("market=KTS");
  });

  test("기본값과 다른 기간만 range= 파라미터로 남는다", () => {
    const state: ChartViewState = { ...defaultState(), preset: "3M" };
    expect(encodeChartViewState(state, DEFAULT_MARKET)).toBe("range=3M");
  });

  test("기본값과 다른 지표만 metric= 파라미터로 남는다", () => {
    const state: ChartViewState = { ...defaultState(), metric: "yield" };
    expect(encodeChartViewState(state, DEFAULT_MARKET)).toBe("metric=yield");
  });

  test("셋 다 기본값과 다르면 세 파라미터 모두 남는다", () => {
    const state: ChartViewState = { market: "KTS", preset: "3Y", metric: "yield" };
    expect(encodeChartViewState(state, DEFAULT_MARKET)).toBe("market=KTS&range=3Y&metric=yield");
  });
});

describe("decodeChartViewState", () => {
  const options = { availableMarkets: AVAILABLE_MARKETS, defaultMarket: DEFAULT_MARKET };

  test("빈 문자열은 기본값(defaultMarket 포함)", () => {
    expect(decodeChartViewState("", options)).toEqual(defaultState());
  });

  test("실제 존재하는 시장은 채택된다", () => {
    const result = decodeChartViewState("market=KTS", options);
    expect(result.market).toBe("KTS");
  });

  test("존재하지 않는 시장은 defaultMarket으로 폴백한다", () => {
    const result = decodeChartViewState("market=소액채권", options);
    expect(result.market).toBe(DEFAULT_MARKET);
  });

  test("허용되지 않은 range는 기본 기간(1Y)으로 폴백한다", () => {
    const result = decodeChartViewState("range=10Y", options);
    expect(result.preset).toBe(DEFAULT_CHART_VIEW_STATE.preset);
  });

  test("허용되지 않은 metric은 기본 지표(price)로 폴백한다", () => {
    const result = decodeChartViewState("metric=volume", options);
    expect(result.metric).toBe(DEFAULT_CHART_VIEW_STATE.metric);
  });

  test("유효한 range/metric은 그대로 반영된다", () => {
    const result = decodeChartViewState("range=3M&metric=yield", options);
    expect(result.preset).toBe("3M");
    expect(result.metric).toBe("yield");
  });
});

describe("round-trip", () => {
  test("decodeChartViewState(encodeChartViewState(state))가 원 상태를 복원한다", () => {
    const options = { availableMarkets: AVAILABLE_MARKETS, defaultMarket: DEFAULT_MARKET };
    const state: ChartViewState = { market: "KTS", preset: "6M", metric: "yield" };
    expect(decodeChartViewState(encodeChartViewState(state, DEFAULT_MARKET), options)).toEqual(state);
  });

  test("기본 상태 자체도 라운드트립된다", () => {
    const options = { availableMarkets: AVAILABLE_MARKETS, defaultMarket: DEFAULT_MARKET };
    const state = defaultState();
    expect(decodeChartViewState(encodeChartViewState(state, DEFAULT_MARKET), options)).toEqual(state);
  });
});
