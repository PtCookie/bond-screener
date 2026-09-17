import { useCallback, useEffect, useRef, useState } from "react";
import type { BondMarketCategory } from "@/api";
import {
  DEFAULT_CHART_VIEW_STATE,
  decodeChartViewState,
  encodeChartViewState,
  type ChartViewState,
} from "@/lib/bond/chart-view-state";
import type { PriceChartMetric, RangePreset } from "@/lib/bond/price-series";

export interface UseChartViewStateResult {
  state: ChartViewState;
  /** 마운트 effect의 URL 복원이 끝났는지 — 끝나기 전에는 `useBondPrices`를 쏘지 않는다
   * (기본값으로 한 번, 복원값으로 또 한 번 요청하는 왕복을 없앤다). */
  restored: boolean;
  setMarket: (market: BondMarketCategory) => void;
  setPreset: (preset: RangePreset) => void;
  setMetric: (metric: PriceChartMetric) => void;
}

/**
 * 상세 페이지 가격 추이 차트의 시장·기간·지표 상태를 URL 쿼리(정본)에 동기화하는 훅
 * (ui-audit ㉖). `useScreenerViewState`와 같은 구조를 따르되 두 가지가 다르다:
 *
 * - **sessionStorage 폴백이 없다.** 상세는 종목별 화면이라 세션에 남은 상태가 다른 종목에
 *   잘못 적용될 수 있다 — URL에 없으면 그냥 기본값이다.
 * - **기본 `market`을 인자로 받는다.** `markets[0]`(그 종목에 실제 존재하는 시장 중 선언
 *   순서상 첫 번째)처럼 데이터에서 파생되는 값이라 훅 안에 상수로 둘 수 없다.
 *
 * 초기 `useState`는 항상 `defaultMarket` 기준 기본 상태로 시작하고, 실제 복원은 마운트
 * `useEffect`에서 한다. 상세 island(`BondDetail`)는 `client:load`라 서버에서도 렌더되는데,
 * 서버 HTML은 `location`이 없어 항상 기본 상태다. 하이드레이션 첫 렌더가 URL 상태로
 * 시작하면 서버/클라이언트 마크업이 어긋나 hydration mismatch가 난다
 * (`useScreenerViewState.ts`의 같은 판단 참고).
 */
export function useChartViewState(
  availableMarkets: readonly BondMarketCategory[],
  defaultMarket: BondMarketCategory,
): UseChartViewStateResult {
  const [state, setState] = useState<ChartViewState>({ ...DEFAULT_CHART_VIEW_STATE, market: defaultMarket });
  const [restored, setRestored] = useState(false);
  const restoredRef = useRef(false);
  // sync 콜백이 최신 defaultMarket을 보도록 ref로 들고 있는다 — defaultMarket은 latestPrices가
  // 도착하는 시점에 바뀔 수 있어 콜백을 매번 재생성하고 싶지 않다.
  const defaultMarketRef = useRef(defaultMarket);
  defaultMarketRef.current = defaultMarket;

  const sync = useCallback((next: ChartViewState) => {
    const query = encodeChartViewState(next, defaultMarketRef.current);
    const url = query === "" ? window.location.pathname : `${window.location.pathname}?${query}`;
    // pushState가 아니라 replaceState — 토글 3종을 누를 때마다 히스토리가 쌓이면 뒤로가기가
    // 목록으로 곧장 못 돌아간다(useScreenerViewState.ts의 같은 판단).
    window.history.replaceState(window.history.state, "", url);
  }, []);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const search = window.location.search.replace(/^\?/, "");
    if (search !== "") {
      setState(decodeChartViewState(search, { availableMarkets, defaultMarket }));
    }
    setRestored(true);
    // availableMarkets/defaultMarket을 deps에 넣지 않는다 — 마운트 시점 값만 쓴다(이후
    // latestPrices가 바뀌어도 이미 끝난 복원을 다시 돌릴 이유가 없다). 이 프로젝트는
    // react-hooks/exhaustive-deps를 켜두지 않아 별도 disable 주석이 필요 없다.
  }, []);

  const updateState = useCallback(
    (updater: (prev: ChartViewState) => ChartViewState) => {
      setState((prev) => {
        const next = updater(prev);
        sync(next);
        return next;
      });
    },
    [sync],
  );

  const setMarket = useCallback(
    (market: BondMarketCategory) => updateState((prev) => ({ ...prev, market })),
    [updateState],
  );
  const setPreset = useCallback((preset: RangePreset) => updateState((prev) => ({ ...prev, preset })), [updateState]);
  const setMetric = useCallback(
    (metric: PriceChartMetric) => updateState((prev) => ({ ...prev, metric })),
    [updateState],
  );

  return { state, restored, setMarket, setPreset, setMetric };
}
