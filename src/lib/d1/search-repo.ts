/**
 * 종목 검색용 읽기 전용 D1 리포지토리(MCP `search_bonds` 툴 전용). `detail-repo.ts`(단건
 * 상세)·`snapshot-repo.ts`(전량 스냅샷 빌드)와 목적이 달라 섞지 않는다.
 */
import { BOND_SEARCH_LATEST_PRICE_SQL, buildBondSearchQuery, type BondSearchFilters } from "./sql";

/** `BOND_SEARCH_SELECT_COLUMNS`(`sql.ts`)와 순서·이름이 대응하는 조회 결과 행. */
export interface BondSearchRow {
  isin_cd: string;
  srtn_cd: string | null;
  isin_cd_nm: string;
  bond_isur_nm: string;
  bond_expr_dt: number | null;
  bond_srfc_inrt: number | null;
  bond_int_tcd: string | null;
  bond_bal: number | null;
  kis_grade: string | null;
}

export interface BondSearchLatestPriceRow {
  isin_cd: string;
  bas_dt: number;
  mrkt_ctg: number;
  clpr_prc: number | null;
  clpr_vs: number | null;
  clpr_bnf_rt: number | null;
  trqu: number | null;
}

export interface BondSearchResult {
  rows: BondSearchRow[];
  /** `rows`의 부분집합에 대응(시세가 아직 없는 신규 상장 종목은 빠질 수 있다). */
  latestPrices: BondSearchLatestPriceRow[];
}

/**
 * 필터·정렬·limit으로 종목을 검색하고, 결과 종목들의 최신 시세를 붙여 반환한다.
 * 쿼리 2개(검색 1 + 최신시세 1) — 검색 결과가 0건이면 두 번째 쿼리를 생략한다.
 */
export async function searchBonds(db: D1Database, filters: BondSearchFilters): Promise<BondSearchResult> {
  const { sql, binds } = buildBondSearchQuery(filters);
  const rowsResult = await db
    .prepare(sql)
    .bind(...binds)
    .all<BondSearchRow>();
  const rows = rowsResult.results;
  if (rows.length === 0) return { rows: [], latestPrices: [] };

  const isinCds = rows.map((row) => row.isin_cd);
  const priceResult = await db
    .prepare(BOND_SEARCH_LATEST_PRICE_SQL)
    .bind(JSON.stringify(isinCds))
    .all<BondSearchLatestPriceRow>();

  return { rows, latestPrices: priceResult.results };
}
