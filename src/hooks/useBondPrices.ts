import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import { fetchBondPrices } from "@/lib/bond/client";
import type { BondMarketCategory } from "@/api";

/**
 * `useScreenerData.ts`와 같은 패턴(모듈 스코프 `queryOptions` + 얇은 래퍼 훅)이지만,
 * 상세 시계열은 isinCd/market/기간 파라미터가 있어 `queryOptions`를 팩토리 함수로 둔다.
 *
 * `staleTime: Infinity` — 과거 시세는 불변이라 같은 파라미터로 다시 받을 이유가 없다.
 * `placeholderData: keepPreviousData` — 기간·시장 전환 시 차트가 빈 화면으로 깜빡이지
 * 않고 이전 데이터를 유지한 채 갱신된다.
 */
function bondPricesQueryOptions(isinCd: string, market: BondMarketCategory, from: number, to: number) {
  return queryOptions({
    queryKey: ["bond-prices", isinCd, market, from, to],
    queryFn: () => fetchBondPrices({ isinCd, from, to, market }),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
}

export function useBondPrices(isinCd: string, market: BondMarketCategory, from: number, to: number) {
  return useQuery(bondPricesQueryOptions(isinCd, market, from, to));
}
