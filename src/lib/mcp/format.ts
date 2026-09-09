/**
 * MCP 툴(`src/lib/mcp/tools.ts`)이 반환하는 JSON을 조립하는 순수 함수 계층.
 * D1 조회 결과 → 응답 변환 로직은 재구현하지 않고 `src/lib/bond/detail.ts`(상세·시계열)의
 * 기존 변환을 그대로 재사용한다 — 이 파일이 하는 일은 그 결과를 LLM이 읽기 좋은
 * 형태(행 객체, 핵심 필드만 추린 요약)로 한 번 더 가공하는 것뿐이다.
 */
import type { BondDetailField, BondDetailResponse } from "@/lib/bond/detail";
import { toPriceSeriesResponse } from "@/lib/bond/detail";
import type { BondPriceRowRecord } from "@/lib/bond/columns";
import { codeToMarketCategory } from "@/lib/bond/market";
import type { BondSearchLatestPriceRow, BondSearchRow } from "@/lib/d1/search-repo";

/** `toPriceSeriesResponse`의 컬럼 지향 출력을 행 객체 배열로 편다 — LLM에는 컬럼 인덱싱보다 self-describing한 행이 읽기 쉽다. */
export function priceRowsForLlm(rows: readonly BondPriceRowRecord[]): Record<string, string | number | null>[] {
  const series = toPriceSeriesResponse(rows);
  return series.rows.map((row) => Object.fromEntries(series.columns.map((col, i) => [col, row[i]])));
}

/** `get_bond` 기본(비-verbose) 출력 — 발행조건·현재 신용등급·최신 시세만 추린 요약. */
export interface BondSummary {
  isinCd: string;
  srtnCd: string | null;
  name: BondDetailField;
  issuer: BondDetailField;
  maturityDate: BondDetailField;
  issueDate: BondDetailField;
  couponRate: BondDetailField;
  interestType: BondDetailField;
  outstandingBalance: string | number | null;
  grades: {
    kis: string | number | null;
    kbp: string | number | null;
    nice: string | number | null;
    fn: string | number | null;
  } | null;
  latestPrices: BondDetailResponse["latestPrices"];
}

export function toBondSummary(isinCd: string, srtnCd: string | null, detail: BondDetailResponse): BondSummary {
  const { bond, state, latestPrices } = detail;
  return {
    isinCd,
    srtnCd,
    name: bond.isinCdNm,
    issuer: bond.bondIsurNm,
    maturityDate: bond.bondExprDt,
    issueDate: bond.bondIssuDt,
    couponRate: bond.bondSrfcInrt,
    interestType: bond.bondIntTcd,
    outstandingBalance: state?.bondBal ?? null,
    grades: state ? { kis: state.kisGrade, kbp: state.kbpGrade, nice: state.niceGrade, fn: state.fnGrade } : null,
    latestPrices,
  };
}

/** `search_bonds` 출력 행 1개 — 검색 결과(`BondSearchRow`)에 최신 시세(있으면)를 붙인다. */
export interface BondSearchResultRow {
  isinCd: string;
  srtnCd: string | null;
  name: string;
  issuer: string;
  maturityDate: number | null;
  couponRate: number | null;
  interestType: string | null;
  outstandingBalance: number | null;
  kisGrade: string | null;
  latestPrice: {
    basDt: number;
    market: string | null;
    closePrice: number | null;
    closeChange: number | null;
    closeYield: number | null;
    volume: number | null;
  } | null;
}

export function toBondSearchResultRows(
  rows: readonly BondSearchRow[],
  latestPrices: readonly BondSearchLatestPriceRow[],
): BondSearchResultRow[] {
  // 같은 isin_cd가 같은 최신 bas_dt에 KTS·일반채권 두 시장 행을 낼 수 있다 —
  // `BOND_SEARCH_LATEST_PRICE_SQL`이 `mrkt_ctg ASC`로 정렬해 주므로, 먼저 만난 값만
  // 채택(첫 값 우선)해 어느 시장이 남는지 결정적으로 만든다(정렬 없이 `new Map`으로
  // 만들면 나중 값이 덮어써 실행마다 달라질 수 있었다).
  const priceByIsin = new Map<string, BondSearchLatestPriceRow>();
  for (const price of latestPrices) {
    if (!priceByIsin.has(price.isin_cd)) priceByIsin.set(price.isin_cd, price);
  }
  return rows.map((row) => {
    const price = priceByIsin.get(row.isin_cd);
    return {
      isinCd: row.isin_cd,
      srtnCd: row.srtn_cd,
      name: row.isin_cd_nm,
      issuer: row.bond_isur_nm,
      maturityDate: row.bond_expr_dt,
      couponRate: row.bond_srfc_inrt,
      interestType: row.bond_int_tcd,
      outstandingBalance: row.bond_bal,
      kisGrade: row.kis_grade,
      latestPrice: price
        ? {
            basDt: price.bas_dt,
            market: codeToMarketCategory(price.mrkt_ctg),
            closePrice: price.clpr_prc,
            closeChange: price.clpr_vs,
            closeYield: price.clpr_bnf_rt,
            volume: price.trqu,
          }
        : null,
    };
  });
}
