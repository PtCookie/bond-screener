/**
 * 종목 검색용 읽기 전용 D1 리포지토리(MCP `search_bonds` 툴 전용). `detail-repo.ts`(단건
 * 상세)·`snapshot-repo.ts`(전량 스냅샷 빌드)와 목적이 달라 섞지 않는다.
 */
import {
  BOND_SEARCH_LATEST_PRICE_SQL,
  CODE_LABEL_BY_PAIRS_SQL,
  buildBondSearchQuery,
  type BondSearchFilters,
} from "./sql";

/** `BOND_SEARCH_SELECT_COLUMNS`(`sql.ts`)와 순서·이름이 대응하는 조회 결과 행. */
export interface BondSearchRow {
  isin_cd: string;
  srtn_cd: string | null;
  isin_cd_nm: string;
  bond_isur_nm: string;
  bond_expr_dt: number | null;
  bond_srfc_inrt: number | null;
  bond_int_tcd: string | null;
  scrs_itms_kcd: string | null;
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
  /** `${domain}:${code}` → label. 결과에 실제 등장한 코드만 담는다(`detail-repo.ts`와 같은 규약). */
  codeLabels: Map<string, string>;
}

/** 결과 행의 코드 컬럼 → `code_label.domain`. 응답에 라벨을 함께 실어 LLM이 코드 원문을 보지 않게 한다. */
const SEARCH_CODE_DOMAINS = [
  ["scrs_itms_kcd", "scrsItmsKcd"],
  ["bond_int_tcd", "bondIntTcd"],
] as const;

/**
 * 필터·정렬·limit으로 종목을 검색하고, 결과 종목들의 최신 시세를 붙여 반환한다.
 * 쿼리 최대 3개(검색 1 + 최신시세 1 + 코드 라벨 1) — 검색 결과가 0건이면 뒤의 둘을 생략한다.
 */
export async function searchBonds(db: D1Database, filters: BondSearchFilters): Promise<BondSearchResult> {
  const { sql, binds } = buildBondSearchQuery(filters);
  const rowsResult = await db
    .prepare(sql)
    .bind(...binds)
    .all<BondSearchRow>();
  const rows = rowsResult.results;
  if (rows.length === 0) return { rows: [], latestPrices: [], codeLabels: new Map() };

  const isinCds = rows.map((row) => row.isin_cd);
  const priceResult = await db
    .prepare(BOND_SEARCH_LATEST_PRICE_SQL)
    .bind(JSON.stringify(isinCds))
    .all<BondSearchLatestPriceRow>();

  return { rows, latestPrices: priceResult.results, codeLabels: await fetchCodeLabels(db, rows) };
}

/**
 * 결과에 등장한 코드의 라벨만 조회한다 — `src/lib/d1/detail-repo.ts`가 쓰는 것과 같은
 * `CODE_LABEL_BY_PAIRS_SQL` 패턴이다. 코드가 하나도 없으면 쿼리를 생략한다(0건일 때 시세
 * 쿼리를 생략하는 이 파일의 기존 규약과 같은 이유 — 불필요한 D1 라운드트립 방지).
 */
async function fetchCodeLabels(db: D1Database, rows: readonly BondSearchRow[]): Promise<Map<string, string>> {
  const pairs = new Map<string, [string, string]>();
  for (const row of rows) {
    for (const [column, domain] of SEARCH_CODE_DOMAINS) {
      const code = row[column];
      if (code === null) continue;
      pairs.set(`${domain}:${code}`, [domain, code]);
    }
  }
  const labels = new Map<string, string>();
  if (pairs.size === 0) return labels;

  const result = await db
    .prepare(CODE_LABEL_BY_PAIRS_SQL)
    .bind(JSON.stringify([...pairs.values()]))
    .all<{ domain: string; code: string; label: string }>();
  for (const r of result.results) labels.set(`${r.domain}:${r.code}`, r.label);
  return labels;
}
