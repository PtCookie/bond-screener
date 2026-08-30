/**
 * 상세 페이지 최상단 island. `BondScreener.tsx`와 같은 구조 — 최상단만 `QueryProvider`로
 * 감싸고 나머지는 평범한 React 합성이다(Astro 경계를 넘지 않는다, `QueryProvider.tsx` 주석 참고).
 *
 * 채권 기본정보·상태 이력·최신 시세는 `src/pages/bond/[id].astro`가 SSR로 받아 props로
 * 그대로 넘긴다 — 시계열(가격 차트)만 클라이언트에서 별도로 받는다(`PriceChartCard`).
 */
import { BOND_MARKET_CATEGORIES, type BondMarketCategory } from "@/api";
import { QueryProvider } from "@/components/providers/QueryProvider";
import type { BondDetailApiResponse } from "@/lib/bond/detail";
import { BondAllFields } from "./BondAllFields";
import { BondDetailHeader } from "./BondDetailHeader";
import { BondFieldSections } from "./BondFieldSections";
import { BondStateHistory } from "./BondStateHistory";
import { PriceChartCard } from "./PriceChartCard";

interface BondDetailProps {
  detail: BondDetailApiResponse;
}

function BondDetailInner({ detail }: BondDetailProps) {
  const { isinCd, srtnCd, bond, state, stateHistory, latestPrices } = detail;

  // BOND_MARKET_CATEGORIES 선언 순서(KTS → 일반채권 → 소액채권)로 실제 존재하는 시장만.
  const markets: BondMarketCategory[] = BOND_MARKET_CATEGORIES.filter((m) => latestPrices.some((p) => p.mrktCtg === m));

  return (
    <div className="space-y-6">
      <BondDetailHeader
        isinCd={isinCd}
        srtnCd={srtnCd}
        isinCdNm={(bond.isinCdNm as string | null) ?? null}
        bondIsurNm={(bond.bondIsurNm as string | null) ?? null}
        latestPrices={latestPrices.map((p) => ({
          mrktCtg: p.mrktCtg as string | null,
          clprPrc: p.clprPrc as number | null,
          clprVs: p.clprVs as number | null,
          clprBnfRt: p.clprBnfRt as number | null,
        }))}
      />

      <PriceChartCard isinCd={isinCd} markets={markets} />

      <BondFieldSections bond={bond} state={state} />

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
