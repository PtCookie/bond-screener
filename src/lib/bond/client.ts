/**
 * 상세 페이지 전용 브라우저 fetch 헬퍼. `src/lib/snapshot/client.ts`의 `fetchJson`
 * 스타일(오류 메시지 포맷 포함)을 따르되, 그 파일은 스냅샷 전용이라 여기 별도로 둔다.
 */
import type { PriceSeriesResponsePayload } from "./price-series";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`요청 실패: ${url} (HTTP ${res.status})`);
  return res.json() as Promise<T>;
}

export interface FetchBondPricesParams {
  isinCd: string;
  from: number;
  to: number;
  market: string;
}

/** `market`은 항상 명시한다 — 생략하면 여러 시장이 섞여 와 시리즈 time 유일성이 깨진다. */
export function fetchBondPrices({
  isinCd,
  from,
  to,
  market,
}: FetchBondPricesParams): Promise<PriceSeriesResponsePayload> {
  const params = new URLSearchParams({ from: String(from), to: String(to), market });
  return fetchJson<PriceSeriesResponsePayload>(`/api/bond/${isinCd}/prices?${params}`);
}
