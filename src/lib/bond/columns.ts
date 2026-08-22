/**
 * D1 테이블의 컬럼 순서 단일 정본.
 *
 * 이 배열들이 (a) `src/lib/d1/sql.ts`가 생성하는 `json_extract($[n])` 인덱스,
 * (b) `src/lib/bond/mappers.ts`의 행 인코더가 만드는 배열 위치, (c) 지문 계산 순서를
 * 전부 구동한다. 손으로 여러 곳에 나열하면 반드시 어긋나므로, 순서를 바꾸려면
 * 반드시 이 파일과 `migrations/0001_init.sql`을 함께 고칠 것 — 둘의 컬럼 순서는
 * 1:1로 일치해야 한다.
 *
 * 각 배열은 `migrations/0001_init.sql`의 `CREATE TABLE` 컬럼 순서와 정확히 같다.
 */

/** `bond` 테이블. 앞 6개(`isin_cd`~`sic_nm`)는 PK/필수/운영 컬럼, 이후는 API 필드 순서를 따른다. */
export const BOND_COLUMNS = [
  "isin_cd",
  "crno",
  "isin_cd_nm",
  "bond_isur_nm",
  "srtn_cd",
  "itms_nm",
  "sic_nm",
  "scrs_itms_kcd",
  "bond_issu_cur_cd",
  "bond_issu_dt",
  "bond_expr_dt",
  "lstg_dt",
  "bond_srfc_inrt",
  "irt_chng_dcd_nm",
  "grn_dcd",
  "bond_rnkn_dcd",
  "optn_tcd",
  "pclr_bond_kcd",
  "bond_offr_mcd",
  "txtn_dcd",
  "pamt_rdpt_mcd",
  "bond_int_tcd",
  "int_cmpu_mcd",
  "bond_reg_inst_dcd",
  "rgt_exert_mnbd_dcd",
  "bnk_hldy_int_pydy_dcd",
  "sttr_hldy_int_pydy_dcd",
  "int_pay_mmnt_dcd",
  "int_pay_cycl_ctt",
  "bond_issu_amt",
  "bond_pymt_amt",
  "strips_psbl_yn",
  "strips_nm",
  "pris_lnkg_bond_yn",
  "crfnd_yn",
  "prmnc_bond_yn",
  "qib_trgt_scrt_yn",
  "elps_int_pay_yn",
  "piam_pay_inst_nm",
  "piam_pay_brof_nm",
  "issu_dpty_nm",
  "bond_undt_inst_nm",
  "bond_grn_inst_nm",
  "cpbd_mng_cmpy_nm",
  "first_seen_bas_dt",
  "last_chg_bas_dt",
  "fp",
] as const;

/**
 * 지문(fp) 계산에 포함할 컬럼 — `BOND_COLUMNS`에서 PK와 운영 컬럼(`first_seen_bas_dt`,
 * `last_chg_bas_dt`, `fp`)과, 기본정보 API가 채우지 않는 `srtn_cd`/`itms_nm`을 뺀 것.
 * `srtn_cd`/`itms_nm`을 포함하면 시세 sync가 채운 값 때문에 기본정보 sync가 매번
 * "변경됨"으로 오판한다.
 */
export const BOND_FINGERPRINT_COLUMNS = BOND_COLUMNS.filter(
  (col) =>
    col !== "isin_cd" &&
    col !== "srtn_cd" &&
    col !== "itms_nm" &&
    col !== "first_seen_bas_dt" &&
    col !== "last_chg_bas_dt" &&
    col !== "fp",
);

/** `bond_state` 테이블. */
export const BOND_STATE_COLUMNS = [
  "isin_cd",
  "valid_from",
  "valid_to",
  "bond_bal",
  "nxtm_copn_dt",
  "rbf_copn_dt",
  "kis_grade",
  "kbp_grade",
  "nice_grade",
  "fn_grade",
] as const;

/** `bond_state`에서 변경분 비교 대상 — `isin_cd`/`valid_from`/`valid_to`를 뺀 값 컬럼 7개. */
export const BOND_STATE_VALUE_COLUMNS = BOND_STATE_COLUMNS.filter(
  (col) => col !== "isin_cd" && col !== "valid_from" && col !== "valid_to",
);

/** `bond_price` 테이블. */
export const BOND_PRICE_COLUMNS = [
  "isin_cd",
  "bas_dt",
  "mrkt_ctg",
  "clpr_prc",
  "clpr_vs",
  "clpr_bnf_rt",
  "mkp_prc",
  "mkp_bnf_rt",
  "hipr_prc",
  "hipr_bnf_rt",
  "lopr_prc",
  "lopr_bnf_rt",
  "trqu",
  "tr_prc",
  "xp_yr_cnt",
  "itms_ctg",
] as const;

/** `code_label` 테이블. */
export const CODE_LABEL_COLUMNS = ["domain", "code", "label"] as const;

export type BondColumn = (typeof BOND_COLUMNS)[number];
export type BondStateColumn = (typeof BOND_STATE_COLUMNS)[number];
export type BondPriceColumn = (typeof BOND_PRICE_COLUMNS)[number];
export type CodeLabelColumn = (typeof CODE_LABEL_COLUMNS)[number];

/** 컬럼 순서대로 값을 나열한 행. 길이가 대응 `*_COLUMNS`와 반드시 같아야 한다. */
export type BondRow = readonly (string | number | null)[];
export type BondStateRow = readonly (string | number | null)[];
export type BondPriceRow = readonly (string | number | null)[];
export type CodeLabelRow = readonly (string | number | null)[];

/**
 * 기본정보 API가 채우지 않는(시세 API 전용) `bond` 컬럼. 시세 sync가
 * `srtn_cd`/`itms_nm`을 NULL일 때만 채우는 UPDATE 문 생성에 쓰인다.
 */
export const BOND_PRICE_SOURCED_COLUMNS = ["srtn_cd", "itms_nm"] as const;

/** `bond`에서 저카디널리티 코드/명칭 쌍 중 라벨을 `code_label`로 뺀 코드 컬럼과 그 domain(원본 API 필드명). */
export const CODE_LABEL_DOMAINS: Readonly<Record<string, string>> = {
  scrs_itms_kcd: "scrsItmsKcd",
  bond_issu_cur_cd: "bondIssuCurCd",
  grn_dcd: "grnDcd",
  bond_rnkn_dcd: "bondRnknDcd",
  optn_tcd: "optnTcd",
  pclr_bond_kcd: "pclrBondKcd",
  bond_offr_mcd: "bondOffrMcd",
  txtn_dcd: "txtnDcd",
  pamt_rdpt_mcd: "pamtRdptMcd",
  bond_int_tcd: "bondIntTcd",
  int_cmpu_mcd: "intCmpuMcd",
  bond_reg_inst_dcd: "bondRegInstDcd",
  rgt_exert_mnbd_dcd: "rgtExertMnbdDcd",
  bnk_hldy_int_pydy_dcd: "bnkHldyIntPydyDcd",
  sttr_hldy_int_pydy_dcd: "sttrHldyIntPydyDcd",
  int_pay_mmnt_dcd: "intPayMmntDcd",
};
