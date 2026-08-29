/**
 * 종목 시계열 조회. `from`/`to`(YYYYMMDD, 기본 최근 1년)·`market`(KTS/일반채권/소액채권,
 * 기본 전체) 쿼리 파라미터. `bond_price` PK가 `(isin_cd, bas_dt, mrkt_ctg)` +
 * `WITHOUT ROWID`라 `isin_cd` 등호 + `bas_dt` 범위 조회는 보조 인덱스 없이 PK
 * 레인지 스캔이 된다(`migrations/0002_indexes.sql` 주석 참고).
 *
 * 응답은 스냅샷과 같은 컬럼 지향 포맷(`src/lib/snapshot/format.ts`) — 수백~수천 행에서
 * 키 반복을 없앤다. `LIMIT`을 채우면 `truncated: true`(무제한 스캔 방지, 별도 COUNT 쿼리 없음).
 *
 * 로직 위치·`env` 접근 방식은 `[id].ts`와 동일 — 그 파일 상단 주석 참고.
 */
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { resolveIsinCd } from "@/lib/d1/detail-repo";
import { fetchBondPriceSeries } from "@/lib/d1/price-repo";
import { toPriceSeriesResponse } from "@/lib/bond/detail";
import {
  DETAIL_CACHE_CONTROL,
  errorResponse,
  jsonResponse,
  parseBondRef,
  parseDateRange,
  parseMarket,
} from "@/lib/api/params";

export const prerender = false;

/** 무제한 스캔 방지용 상한. 일별 시세라 3,000행이면 약 12년치 — 실사용 범위를 넉넉히 커버한다. */
const PRICE_SERIES_LIMIT = 3000;

export const GET: APIRoute = async ({ params, url }) => {
  const ref = parseBondRef(params.id);
  if (!ref) return errorResponse(400, "id는 12자리 ISIN 또는 9자리 단축코드여야 합니다.");

  const range = parseDateRange(url.searchParams);
  if (!range.ok) return errorResponse(400, range.error);

  const market = parseMarket(url.searchParams);
  if (!market.ok) return errorResponse(400, market.error);

  const isinCd = await resolveIsinCd(env.DB, ref);
  if (!isinCd) return errorResponse(404, "종목을 찾을 수 없습니다.");

  const { rows, truncated } = await fetchBondPriceSeries(env.DB, isinCd, {
    from: range.value.from,
    to: range.value.to,
    marketCode: market.value,
    limit: PRICE_SERIES_LIMIT,
  });

  return jsonResponse(
    { isinCd, from: range.value.from, to: range.value.to, ...toPriceSeriesResponse(rows), truncated },
    { cacheControl: DETAIL_CACHE_CONTROL },
  );
};
