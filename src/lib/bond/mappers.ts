/**
 * `src/api/`의 와이어 타입(`BondBasiInfoItem`/`BondPriceInfoItem`)을 D1 저장 형태
 * (`BondRow`/`BondStateRow`/`BondPriceRow`/`CodeLabelRow[]`)로 변환한다.
 *
 * 정규화(`""`/`" "`/`"NULL"` → `null`, 날짜/정수/Y-N 변환)는 `normalize.ts`에 위임하고,
 * 여기서는 필드 순서를 `columns.ts`의 정본과 맞추는 매핑만 한다.
 */
import type { BondBasiInfoItem, BondPriceInfoItem } from "@/api";
import { normDate, normInt, normReal, normText, normYn } from "@/lib/openapi/normalize";
import {
  BOND_COLUMNS,
  BOND_FINGERPRINT_COLUMNS,
  CODE_LABEL_DOMAINS,
  type BondColumn,
  type BondPriceRow,
  type BondRow,
  type BondStateRow,
  type CodeLabelRow,
} from "./columns";
import { fingerprintRow } from "./fingerprint";
import { marketCategoryToCode } from "./market";

/**
 * `bond` 테이블 값(운영 컬럼 제외)을 컬럼명 키로 도출한다. `srtn_cd`/`itms_nm`은 기본정보
 * API에 없으므로 항상 `null` — 시세 sync가 별도 UPDATE로 채운다.
 *
 * 키 기반 맵으로 두는 이유: `BOND_COLUMNS`(전체 저장 순서)와 `BOND_FINGERPRINT_COLUMNS`
 * (지문 계산 대상, `isin_cd`/`srtn_cd`/`itms_nm`/운영 컬럼 제외)의 순서가 서로 다르다.
 * 위치 배열 하나로 두 용도를 겸하면 둘 중 하나가 바뀔 때 조용히 어긋나므로,
 * `buildBondRow`가 이 맵에서 각 용도에 맞는 순서로 다시 뽑아 쓴다.
 */
function mapBondFields(
  item: BondBasiInfoItem,
): Record<Exclude<BondColumn, "first_seen_bas_dt" | "last_chg_bas_dt" | "fp">, string | number | null> {
  return {
    isin_cd: normText(item.isinCd),
    crno: normText(item.crno),
    isin_cd_nm: normText(item.isinCdNm),
    bond_isur_nm: normText(item.bondIsurNm),
    srtn_cd: null, // 시세 API 전용
    itms_nm: null, // 시세 API 전용
    sic_nm: normText(item.sicNm),
    scrs_itms_kcd: normText(item.scrsItmsKcd),
    bond_issu_cur_cd: normText(item.bondIssuCurCd),
    bond_issu_dt: normDate(item.bondIssuDt),
    bond_expr_dt: normDate(item.bondExprDt),
    lstg_dt: normDate(item.lstgDt),
    bond_srfc_inrt: normReal(item.bondSrfcInrt),
    irt_chng_dcd_nm: normText(item.irtChngDcdNm),
    grn_dcd: normText(item.grnDcd),
    bond_rnkn_dcd: normText(item.bondRnknDcd),
    optn_tcd: normText(item.optnTcd),
    pclr_bond_kcd: normText(item.pclrBondKcd),
    bond_offr_mcd: normText(item.bondOffrMcd),
    txtn_dcd: normText(item.txtnDcd),
    pamt_rdpt_mcd: normText(item.pamtRdptMcd),
    bond_int_tcd: normText(item.bondIntTcd),
    int_cmpu_mcd: normText(item.intCmpuMcd),
    bond_reg_inst_dcd: normText(item.bondRegInstDcd),
    rgt_exert_mnbd_dcd: normText(item.rgtExertMnbdDcd),
    bnk_hldy_int_pydy_dcd: normText(item.bnkHldyIntPydyDcd),
    sttr_hldy_int_pydy_dcd: normText(item.sttrHldyIntPydyDcd),
    int_pay_mmnt_dcd: normText(item.intPayMmntDcd),
    int_pay_cycl_ctt: normText(item.intPayCyclCtt),
    bond_issu_amt: normInt(item.bondIssuAmt),
    bond_pymt_amt: normInt(item.bondPymtAmt),
    strips_psbl_yn: normYn(item.stripsPsblYn),
    strips_nm: normText(item.stripsNm),
    pris_lnkg_bond_yn: normYn(item.prisLnkgBondYn),
    crfnd_yn: normYn(item.crfndYn),
    prmnc_bond_yn: normYn(item.prmncBondYn),
    qib_trgt_scrt_yn: normYn(item.qibTrgtScrtYn),
    elps_int_pay_yn: normYn(item.elpsIntPayYn),
    piam_pay_inst_nm: normText(item.piamPayInstNm),
    piam_pay_brof_nm: normText(item.piamPayBrofNm),
    issu_dpty_nm: normText(item.issuDptyNm),
    bond_undt_inst_nm: normText(item.bondUndtInstNm),
    bond_grn_inst_nm: normText(item.bondGrnInstNm),
    cpbd_mng_cmpy_nm: normText(item.cpbdMngCmpyNm),
  };
}

/**
 * `BondBasiInfoItem` 1건을 `BondRow`(`BOND_COLUMNS` 순서, 운영 컬럼 포함)로 변환한다.
 *
 * @param basDt 이 응답의 기준일자(YYYYMMDD 정수) — `first_seen_bas_dt`/`last_chg_bas_dt`의 근거
 * @param existingFirstSeen 기존 행이 있으면 그 `first_seen_bas_dt`(최초값 보존), 신규면 `null`
 */
export function buildBondRow(item: BondBasiInfoItem, basDt: number, existingFirstSeen: number | null): BondRow {
  const fields = mapBondFields(item);
  const fp = fingerprintRow(BOND_FINGERPRINT_COLUMNS.map((col) => fields[col as keyof typeof fields]));
  const opValues: Record<"first_seen_bas_dt" | "last_chg_bas_dt" | "fp", string | number | null> = {
    first_seen_bas_dt: existingFirstSeen ?? basDt,
    last_chg_bas_dt: basDt,
    fp,
  };
  return BOND_COLUMNS.map((col) =>
    col in opValues ? opValues[col as keyof typeof opValues] : fields[col as keyof typeof fields],
  );
}

/** `BondBasiInfoItem`에서 `bond_state`로 옮겨간 값 7개를 뽑는다(`BOND_STATE_VALUE_COLUMNS` 순서). */
export function mapBondStateValues(item: BondBasiInfoItem): (string | number | null)[] {
  return [
    normInt(item.bondBal), // bond_bal
    normDate(item.nxtmCopnDt), // nxtm_copn_dt
    normDate(item.rbfCopnDt), // rbf_copn_dt
    normText(item.kisScrsItmsKcdNm), // kis_grade
    normText(item.kbpScrsItmsKcdNm), // kbp_grade
    normText(item.niceScrsItmsKcdNm), // nice_grade
    normText(item.fnScrsItmsKcdNm), // fn_grade
  ];
}

/** `mapBondStateValues`를 `bond_state` 삽입용 `BondStateRow`(전체 컬럼)로 감싼다. */
export function buildBondStateRow(item: BondBasiInfoItem, isinCd: string, validFrom: number): BondStateRow {
  return [isinCd, validFrom, null, ...mapBondStateValues(item)];
}

/**
 * `BondBasiInfoItem`에서 저카디널리티 코드/명칭 쌍 16개를 `code_label` 행으로 뽑는다.
 * 코드가 비어 있으면(정규화 후 `null`) 그 쌍은 건너뛴다 — 사전 키를 만들 수 없다.
 */
export function mapBondCodeLabels(item: BondBasiInfoItem): CodeLabelRow[] {
  const record = item as unknown as Record<string, string>;
  const rows: CodeLabelRow[] = [];
  for (const domain of Object.values(CODE_LABEL_DOMAINS)) {
    const code = normText(record[domain]);
    const label = normText(record[`${domain}Nm`]);
    if (code === null || label === null) continue;
    rows.push([domain, code, label]);
  }
  return rows;
}

/** `BondPriceInfoItem` 1건을 `BondPriceRow`(`BOND_PRICE_COLUMNS` 순서)로 변환한다. */
export function buildBondPriceRow(item: BondPriceInfoItem): BondPriceRow {
  return [
    normText(item.isinCd), // isin_cd
    normDate(item.basDt), // bas_dt
    marketCategoryToCode(item.mrktCtg), // mrkt_ctg
    normReal(item.clprPrc), // clpr_prc
    normReal(item.clprVs), // clpr_vs
    normReal(item.clprBnfRt), // clpr_bnf_rt
    normReal(item.mkpPrc), // mkp_prc
    normReal(item.mkpBnfRt), // mkp_bnf_rt
    normReal(item.hiprPrc), // hipr_prc
    normReal(item.hiprBnfRt), // hipr_bnf_rt
    normReal(item.loprPrc), // lopr_prc
    normReal(item.loprBnfRt), // lopr_bnf_rt
    normInt(item.trqu), // trqu
    normInt(item.trPrc), // tr_prc
    normReal(item.xpYrCnt), // xp_yr_cnt (KTS만 채워짐)
    normText(item.itmsCtg), // itms_ctg (KTS만 채워짐)
  ];
}
