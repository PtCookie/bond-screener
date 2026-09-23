/**
 * 상세 페이지 최상단 island. `BondScreener.tsx`와 같은 구조 — 최상단만 `QueryProvider`로
 * 감싸고 나머지는 평범한 React 합성이다(Astro 경계를 넘지 않는다, `QueryProvider.tsx` 주석 참고).
 *
 * 채권 기본정보·상태 이력·최신 시세는 `src/pages/bond/[id].astro`가 SSR로 받아 props로
 * 그대로 넘긴다 — 시계열(가격 차트)만 클라이언트에서 별도로 받는다(`PriceChartCard`).
 */
import { BOND_MARKET_CATEGORIES, type BondMarketCategory } from "@/api";
import { AppHeader } from "@/components/layout/AppHeader";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { useChartViewState } from "@/hooks/useChartViewState";
import type { BondDetailApiResponse } from "@/lib/bond/detail";
import { BondAllFields } from "./BondAllFields";
import { BondDetailHeader } from "./BondDetailHeader";
import { BondFieldSections } from "./BondFieldSections";
import { BondStateHistory } from "./BondStateHistory";
import { PriceChartCard } from "./PriceChartCard";

interface BondDetailProps {
  detail: BondDetailApiResponse;
}

/** 시세가 한 건도 없어 시장을 파생할 수 없을 때의 조회 기본값. */
const DEFAULT_MARKET: BondMarketCategory = "일반채권";

function BondDetailInner({ detail }: BondDetailProps) {
  const { isinCd, bond, state, stateHistory, latestPrices } = detail;

  // BOND_MARKET_CATEGORIES 선언 순서(KTS → 일반채권 → 소액채권)로 실제 존재하는 시장만.
  const markets: BondMarketCategory[] = BOND_MARKET_CATEGORIES.filter((m) => latestPrices.some((p) => p.mrktCtg === m));

  // 시장·기간·지표는 헤더 토글과 가격 추이 차트가 공유하므로 여기가 소유자다 — 시장 토글
  // UI는 BondDetailHeader에, 조회는 PriceChartCard에 있다. useScreenerViewState와 같은
  // replaceState 동기화로 URL에 싣는다(ui-audit ㉖).
  const defaultMarket = markets[0] ?? DEFAULT_MARKET;
  const {
    state: chartState,
    restored: chartRestored,
    setMarket,
    setPreset,
    setMetric,
  } = useChartViewState(markets, defaultMarket);
  const market = chartState.market;

  return (
    <div className="space-y-6">
      {/* h1은 BondDetailHeader의 종목명이 소유한다 — title을 넘기지 않는 이유. */}
      <AppHeader />
      <BondDetailHeader
        isinCd={isinCd}
        isinCdNm={(bond.isinCdNm as string | null) ?? null}
        markets={markets}
        market={market}
        onMarketChange={setMarket}
        latestPrices={latestPrices.map((p) => ({
          mrktCtg: p.mrktCtg as string | null,
          clprPrc: p.clprPrc as number | null,
          clprVs: p.clprVs as number | null,
          clprBnfRt: p.clprBnfRt as number | null,
        }))}
      />

      <PriceChartCard
        isinCd={isinCd}
        market={market}
        preset={chartState.preset}
        metric={chartState.metric}
        onPresetChange={setPreset}
        onMetricChange={setMetric}
        enabled={chartRestored}
      />

      {/* 시장구분은 bond/state 어느 컬럼도 아닌 latestPrices 파생값, isinCd는 bond
          응답에 없는 테이블 PK라 둘 다 derived로 넘긴다. */}
      <BondFieldSections
        bond={bond}
        state={state}
        derived={{ mrktCtg: markets.length > 0 ? markets.join(", ") : null, isinCd }}
      />

      {/* 이력이 1개뿐이면 발행 이후 변경이 없다는 뜻 — 위 섹션에 이미 현재값이 나와 있어
          별도 표가 중복이라 생략한다. */}
      {stateHistory.length > 1 && (
        <BondStateHistory
          stateHistory={stateHistory.map((s) => ({
            validFrom: s.validFrom as number | null,
            validTo: s.validTo as number | null,
            bondBal: s.bondBal as number | null,
            nxtmCopnDt: s.nxtmCopnDt as number | null,
            rbfCopnDt: s.rbfCopnDt as number | null,
            kisGrade: s.kisGrade as string | null,
            kbpGrade: s.kbpGrade as string | null,
            niceGrade: s.niceGrade as string | null,
            fnGrade: s.fnGrade as string | null,
          }))}
        />
      )}

      <BondAllFields bond={bond} />
    </div>
  );
}

export function BondDetail({ detail }: BondDetailProps) {
  return (
    <QueryProvider>
      <BondDetailInner detail={detail} />
    </QueryProvider>
  );
}
