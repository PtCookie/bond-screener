// src/lib/bond/mappers.ts와 동일한 매핑 (스크립트는 TS를 import할 수 없어 중복).
// 고치면 반드시 src/lib/bond/mappers.ts도 같이 확인할 것.
import { normDate, normInt, normReal, normText, normYn, MARKET_CATEGORY_CODE } from "./normalize.mjs";
import { BOND_COLUMNS, BOND_FINGERPRINT_COLUMNS, CODE_LABEL_DOMAINS } from "./columns.mjs";
import { fingerprintRow } from "./fingerprint.mjs";

function mapBondFields(item) {
  return {
    isin_cd: normText(item.isinCd),
    crno: normText(item.crno),
    isin_cd_nm: normText(item.isinCdNm),
    bond_isur_nm: normText(item.bondIsurNm),
    srtn_cd: null,
    itms_nm: null,
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

/** @returns {(string|number|null)[]} BOND_COLUMNS 순서의 행. basDt는 이 백필 스냅샷의 기준일자. */
export function buildBondRow(item, basDt) {
  const fields = mapBondFields(item);
  const fp = fingerprintRow(BOND_FINGERPRINT_COLUMNS.map((c) => fields[c]));
  const op = { first_seen_bas_dt: basDt, last_chg_bas_dt: basDt, fp };
  return BOND_COLUMNS.map((c) => (c in op ? op[c] : fields[c]));
}

/** @returns {(string|number|null)[]} BOND_STATE_COLUMNS 순서의 행(valid_to=null, 초기 상태). */
export function buildBondStateRow(item, isinCd, validFrom) {
  return [
    isinCd,
    validFrom,
    null,
    normInt(item.bondBal),
    normDate(item.nxtmCopnDt),
    normDate(item.rbfCopnDt),
    normText(item.kisScrsItmsKcdNm),
    normText(item.kbpScrsItmsKcdNm),
    normText(item.niceScrsItmsKcdNm),
    normText(item.fnScrsItmsKcdNm),
  ];
}

/** @returns {(string|number|null)[][]} code_label 행 배열(코드/라벨이 둘 다 있는 쌍만). */
export function mapBondCodeLabels(item) {
  const rows = [];
  for (const domain of Object.values(CODE_LABEL_DOMAINS)) {
    const code = normText(item[domain]);
    const label = normText(item[`${domain}Nm`]);
    if (code === null || label === null) continue;
    rows.push([domain, code, label]);
  }
  return rows;
}

/** @returns {(string|number|null)[]} BOND_PRICE_COLUMNS 순서의 행. */
export function buildBondPriceRow(item) {
  return [
    normText(item.isinCd),
    normDate(item.basDt),
    MARKET_CATEGORY_CODE[item.mrktCtg] ?? null,
    normReal(item.clprPrc),
    normReal(item.clprVs),
    normReal(item.clprBnfRt),
    normReal(item.mkpPrc),
    normReal(item.mkpBnfRt),
    normReal(item.hiprPrc),
    normReal(item.hiprBnfRt),
    normReal(item.loprPrc),
    normReal(item.loprBnfRt),
    normInt(item.trqu),
    normInt(item.trPrc),
    normReal(item.xpYrCnt),
    normText(item.itmsCtg),
  ];
}
