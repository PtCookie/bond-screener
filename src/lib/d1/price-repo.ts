/** `bond_price` D1 바인딩 호출. */
import type { BondPriceInfoItem } from "@/api";
import { buildBondPriceRow } from "@/lib/bond/mappers";
import type { BondPriceRowRecord } from "@/lib/bond/columns";
import {
  BOND_FILL_SRTN_ITMS_SQL,
  BOND_PRICE_INSERT_SQL,
  BOND_PRICE_SERIES_BY_MARKET_SQL,
  BOND_PRICE_SERIES_SQL,
} from "./sql";

/**
 * 시세 1일치(`items`)를 삽입한다. 과거 시세는 사후 변경되지 않으므로 `ON CONFLICT DO NOTHING`
 * 만으로 재실행이 idempotent하다 — 변경분 비교가 필요 없다.
 *
 * 동시에 `bond.srtn_cd`/`itms_nm`을 이 페이지에서 처음 보는 종목에 한해 채운다
 * (기본정보 API에는 없는 필드라 시세 sync가 유일한 공급원).
 */
export async function writeBondPricePage(
  db: D1Database,
  items: readonly BondPriceInfoItem[],
): Promise<{ inserted: number; queriesUsed: number }> {
  if (items.length === 0) return { inserted: 0, queriesUsed: 0 };

  const rows = items.map(buildBondPriceRow);
  let queriesUsed = 0;

  await db.prepare(BOND_PRICE_INSERT_SQL).bind(JSON.stringify(rows)).run();
  queriesUsed += 1;

  // srtn_cd/itms_nm 충전은 NULL인 행에만 적용되므로(sql.ts의 WHERE bond.srtn_cd IS NULL)
  // 페이지 전체를 쿼리 1개로 보내도 실제 write는 신규 상장 종목에서만 발생한다.
  const triples = items.map((item) => [item.isinCd, item.srtnCd, item.itmsNm]);
  await db.prepare(BOND_FILL_SRTN_ITMS_SQL).bind(JSON.stringify(triples)).run();
  queriesUsed += 1;

  return { inserted: rows.length, queriesUsed };
}

export interface PriceSeriesOptions {
  /** 기준일자 하한(포함, YYYYMMDD) */
  from: number;
  /** 기준일자 상한(포함, YYYYMMDD) */
  to: number;
  /** `null`이면 시장 필터 없음 — `src/lib/bond/market.ts`의 `marketCategoryToCode` 결과 */
  marketCode: number | null;
  limit: number;
}

export interface PriceSeriesResult {
  rows: BondPriceRowRecord[];
  /** `limit`을 채웠으면 `true` — 더 있을 수 있다는 뜻(무제한 스캔 방지용 상한이라 별도 COUNT 쿼리는 쓰지 않는다). */
  truncated: boolean;
}

/**
 * 종목 시계열을 날짜 범위(+선택적 시장)로 조회한다. `LIMIT`을 `limit + 1`로 걸어
 * 한 행 더 받아보는 것으로 "더 있는지"를 판정한다 — 별도 `COUNT(*)` 쿼리를 추가하지
 * 않기 위한 흔한 트릭.
 */
export async function fetchBondPriceSeries(
  db: D1Database,
  isinCd: string,
  { from, to, marketCode, limit }: PriceSeriesOptions,
): Promise<PriceSeriesResult> {
  const stmt =
    marketCode === null
      ? db.prepare(BOND_PRICE_SERIES_SQL).bind(isinCd, from, to, limit + 1)
      : db.prepare(BOND_PRICE_SERIES_BY_MARKET_SQL).bind(isinCd, from, to, marketCode, limit + 1);

  const result = await stmt.all<BondPriceRowRecord>();
  const truncated = result.results.length > limit;
  return { rows: truncated ? result.results.slice(0, limit) : result.results, truncated };
}
