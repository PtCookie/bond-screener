/**
 * `SnapshotPayload`(v2, base+delta 병합 완료본)를 화면이 쓰는 `ScreenerRow[]`로 푼다.
 * 클라이언트 번들 전용이라 `format.ts`와 달리 `@/` 별칭을 자유롭게 쓴다.
 */
import { codeToMarketCategory } from "@/lib/bond/market";
import type { ScreenerRow } from "@/lib/screener/types";
import { epochDayToYmd, type SnapshotPayload } from "./format";

export function decodeSnapshot(payload: SnapshotPayload): ScreenerRow[] {
  const { columns, cols, issuers, codeLabels, priceColumns, priceIsinCds, priceCols } = payload;
  const colIndex = Object.fromEntries(columns.map((c, i) => [c, i]));
  const priceIndex = Object.fromEntries(priceColumns.map((c, i) => [c, i]));

  const priceRowByIsin = new Map<string, number>();
  priceIsinCds.forEach((isinCd, i) => priceRowByIsin.set(isinCd, i));

  const scrsItmsKcdLabels = codeLabels.scrsItmsKcd ?? {};
  const bondIntTcdLabels = codeLabels.bondIntTcd ?? {};

  const isinCol = cols[colIndex.isin_cd];
  const rowCount = isinCol?.length ?? 0;
  const rows: ScreenerRow[] = new Array(rowCount);

  for (let r = 0; r < rowCount; r++) {
    const isinCd = isinCol[r] as string;
    const scrsItmsKcd = cols[colIndex.scrs_itms_kcd][r] as string | null;
    const bondIntTcd = cols[colIndex.bond_int_tcd][r] as string | null;
    const issuerRef = cols[colIndex.bond_isur_nm][r] as number;

    const priceRow = priceRowByIsin.get(isinCd);
    const mrktCtgCode = priceRow === undefined ? null : (priceCols[priceIndex.mrkt_ctg][priceRow] as number | null);

    rows[r] = {
      isinCd,
      isinCdNm: cols[colIndex.isin_cd_nm][r] as string | null,
      bondIsurNm: issuers[issuerRef] ?? null,
      scrsItmsKcd,
      scrsItmsKcdNm: scrsItmsKcd === null ? null : (scrsItmsKcdLabels[scrsItmsKcd] ?? null),
      bondIssuDt: epochDayToYmd(cols[colIndex.bond_issu_dt][r] as number | null),
      bondExprDt: epochDayToYmd(cols[colIndex.bond_expr_dt][r] as number | null),
      bondSrfcInrt: cols[colIndex.bond_srfc_inrt][r] as number | null,
      kisGrade: cols[colIndex.kis_grade][r] as string | null,
      bondBal: cols[colIndex.bond_bal][r] as number | null,
      bondIntTcd,
      bondIntTcdNm: bondIntTcd === null ? null : (bondIntTcdLabels[bondIntTcd] ?? null),
      mrktCtg: mrktCtgCode === null ? null : codeToMarketCategory(mrktCtgCode),
      clprPrc: priceRow === undefined ? null : (priceCols[priceIndex.clpr_prc][priceRow] as number | null),
      clprVs: priceRow === undefined ? null : (priceCols[priceIndex.clpr_vs][priceRow] as number | null),
      clprBnfRt: priceRow === undefined ? null : (priceCols[priceIndex.clpr_bnf_rt][priceRow] as number | null),
      trqu: priceRow === undefined ? null : (priceCols[priceIndex.trqu][priceRow] as number | null),
    };
  }

  return rows;
}
