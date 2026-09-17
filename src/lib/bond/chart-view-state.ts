/**
 * 상세 페이지 가격 추이 차트의 시장·기간·지표 상태를 URL 쿼리스트링 ↔ `ChartViewState` 간
 * 변환한다. `src/lib/screener/view-state.ts`와 같은 구조·규약(생략 인코딩, 조용한 폴백
 * 디코딩)을 따른다 — `useChartViewState.ts`가 이 인코더/디코더로 상태를 URL에 동기화한다
 * (ui-audit ㉖).
 *
 * 스크리너와 달리 sessionStorage 폴백은 없다 — 상세는 종목별 화면이라 세션에 남은 상태가
 * 다른 종목에 잘못 적용될 수 있다. URL만 정본이다.
 */
import type { BondMarketCategory } from "@/api";
import { PRICE_CHART_METRICS, RANGE_PRESETS, type PriceChartMetric, type RangePreset } from "./price-series";

export interface ChartViewState {
  market: BondMarketCategory;
  preset: RangePreset;
  metric: PriceChartMetric;
}

export const DEFAULT_CHART_VIEW_STATE: Pick<ChartViewState, "preset" | "metric"> = {
  preset: "1Y",
  metric: "price",
};

/**
 * `market`은 기본값이 데이터(그 종목에 실제 존재하는 시장 목록)에서 파생되므로 상수로 두지
 * 않고 호출부(`defaultMarket`)에서 받는다 — `BondDetail.tsx`의 `markets[0]`과 같은 값이어야 한다.
 */
export function encodeChartViewState(state: ChartViewState, defaultMarket: BondMarketCategory): string {
  const params = new URLSearchParams();
  if (state.market !== defaultMarket) params.set("market", state.market);
  if (state.preset !== DEFAULT_CHART_VIEW_STATE.preset) params.set("range", state.preset);
  if (state.metric !== DEFAULT_CHART_VIEW_STATE.metric) params.set("metric", state.metric);
  return params.toString();
}

export interface DecodeChartViewStateOptions {
  /** 실제로 존재하는 시장만 채택한다 — 없는 시장을 복원하면 헤더 시세가 빈 값이 된다. */
  availableMarkets: readonly BondMarketCategory[];
  defaultMarket: BondMarketCategory;
}

/** 파싱 실패·미지의 값은 조용히 기본값으로 폴백한다(throw하지 않음) — URL은 사용자가 손댈 수 있는 입력이다. */
export function decodeChartViewState(
  input: string | URLSearchParams,
  { availableMarkets, defaultMarket }: DecodeChartViewStateOptions,
): ChartViewState {
  const params = typeof input === "string" ? new URLSearchParams(input) : input;

  const rawMarket = params.get("market");
  const market =
    rawMarket !== null && (availableMarkets as readonly string[]).includes(rawMarket)
      ? (rawMarket as BondMarketCategory)
      : defaultMarket;

  const rawPreset = params.get("range");
  const preset =
    rawPreset !== null && (RANGE_PRESETS as readonly string[]).includes(rawPreset)
      ? (rawPreset as RangePreset)
      : DEFAULT_CHART_VIEW_STATE.preset;

  const rawMetric = params.get("metric");
  const metric =
    rawMetric !== null && (PRICE_CHART_METRICS as readonly string[]).includes(rawMetric)
      ? (rawMetric as PriceChartMetric)
      : DEFAULT_CHART_VIEW_STATE.metric;

  return { market, preset, metric };
}
