-- 채권 발행 제원 (SCD Type 1: 지문(fp) 불일치 시 덮어쓰기).
--
-- 75개 API 필드 중 실측(10,000건 표본)에 근거해 골라낸 것만 담는다:
--   - 항상 빈 값(5개: cptUsgeDcd/cptUsgeDcdNm/irtChngDcd/prmncBondTmnDt/qibTmnDt)은 버림
--   - 시간에 따라 변하는 7개(bondBal/nxtmCopnDt/rbfCopnDt/신용등급 4종)는 bond_state로 이동
--   - 신용평가 코드 4개(kis/kbp/nice/fnScrsItmsKcd)는 버림 — 의미가 짝인 *Nm에만 있음
--   - 저카디널리티 코드/명칭 쌍 18개는 코드만 여기 두고 라벨은 code_label로 분리
--   - irtChngDcdNm은 예외적으로 텍스트 그대로 유지 (짝인 코드가 항상 빈 값이라 사전 키를 못 만듦)
--
-- 컬럼 순서는 src/lib/bond/columns.ts의 BOND_COLUMNS와 반드시 일치해야 한다 (json_each 인덱스 정본).
CREATE TABLE bond (
  isin_cd                TEXT    NOT NULL PRIMARY KEY,  -- isinCd
  crno                   TEXT,                          -- crno (docs/api/README.md는 basDt/crno/bondIsurNm을
                                                          -- "필수(1)"라 기술하지만, 10,000건 표본 실측 결과
                                                          -- 0.03%(3건)가 빈 값으로 옴 — 문서와 실측이 어긋나는
                                                          -- 드문 사례라 NOT NULL을 걸지 않는다)
  isin_cd_nm             TEXT    NOT NULL,              -- isinCdNm
  bond_isur_nm           TEXT    NOT NULL,              -- bondIsurNm
  srtn_cd                TEXT,                          -- 시세 API에서만 옴. NULL일 때만 충전
  itms_nm                TEXT,                          -- 시세 API에서만 옴. NULL일 때만 충전
  sic_nm                 TEXT,                          -- sicNm
  scrs_itms_kcd          TEXT,                          -- scrsItmsKcd (라벨: code_label domain='scrsItmsKcd')
  bond_issu_cur_cd       TEXT,                          -- bondIssuCurCd
  bond_issu_dt           INTEGER,                       -- bondIssuDt (YYYYMMDD)
  bond_expr_dt           INTEGER,                       -- bondExprDt (상환 시 상환일자로 갱신될 수 있음)
  lstg_dt                INTEGER,                       -- lstgDt
  bond_srfc_inrt         REAL,                          -- bondSrfcInrt
  irt_chng_dcd_nm        TEXT,                          -- irtChngDcdNm (예외: 코드 없이 라벨만 직접 보관)
  grn_dcd                TEXT,                          -- grnDcd
  bond_rnkn_dcd          TEXT,                          -- bondRnknDcd
  optn_tcd               TEXT,                          -- optnTcd
  pclr_bond_kcd          TEXT,                          -- pclrBondKcd
  bond_offr_mcd          TEXT,                          -- bondOffrMcd
  txtn_dcd               TEXT,                          -- txtnDcd
  pamt_rdpt_mcd          TEXT,                          -- pamtRdptMcd
  bond_int_tcd           TEXT,                          -- bondIntTcd
  int_cmpu_mcd           TEXT,                          -- intCmpuMcd
  bond_reg_inst_dcd      TEXT,                          -- bondRegInstDcd
  rgt_exert_mnbd_dcd     TEXT,                          -- rgtExertMnbdDcd
  bnk_hldy_int_pydy_dcd  TEXT,                          -- bnkHldyIntPydyDcd
  sttr_hldy_int_pydy_dcd TEXT,                          -- sttrHldyIntPydyDcd
  int_pay_mmnt_dcd       TEXT,                          -- intPayMmntDcd
  int_pay_cycl_ctt       TEXT,                          -- intPayCyclCtt
  bond_issu_amt          INTEGER,                       -- bondIssuAmt
  bond_pymt_amt          INTEGER,                       -- bondPymtAmt
  strips_psbl_yn         INTEGER,                       -- stripsPsblYn (0/1)
  strips_nm              TEXT,                          -- stripsNm
  pris_lnkg_bond_yn      INTEGER,                       -- prisLnkgBondYn (0/1)
  crfnd_yn               INTEGER,                       -- crfndYn (0/1)
  prmnc_bond_yn          INTEGER,                       -- prmncBondYn (0/1)
  qib_trgt_scrt_yn       INTEGER,                       -- qibTrgtScrtYn (0/1)
  elps_int_pay_yn        INTEGER,                       -- elpsIntPayYn (0/1)
  piam_pay_inst_nm       TEXT,                          -- piamPayInstNm
  piam_pay_brof_nm       TEXT,                          -- piamPayBrofNm
  issu_dpty_nm           TEXT,                          -- issuDptyNm
  bond_undt_inst_nm      TEXT,                          -- bondUndtInstNm
  bond_grn_inst_nm       TEXT,                          -- bondGrnInstNm
  cpbd_mng_cmpy_nm       TEXT,                          -- cpbdMngCmpyNm
  first_seen_bas_dt      INTEGER NOT NULL,              -- 이 종목이 처음 관측된 basDt (운영 컬럼)
  last_chg_bas_dt        INTEGER NOT NULL,              -- 지문이 마지막으로 바뀐 basDt (운영 컬럼)
  fp                     INTEGER NOT NULL               -- cyrb53 지문 (운영 컬럼)
);

-- 시간에 따라 변하는 속성만 이력 관리 (SCD Type 2).
-- 한 종목의 이력 행 수가 애초에 한 자릿수라 별도 인덱스를 두지 않는다.
CREATE TABLE bond_state (
  isin_cd      TEXT    NOT NULL,
  valid_from   INTEGER NOT NULL,   -- 이 값이 관측된 basDt
  valid_to     INTEGER,            -- NULL이면 현재 유효
  bond_bal     INTEGER,            -- bondBal
  nxtm_copn_dt INTEGER,            -- nxtmCopnDt
  rbf_copn_dt  INTEGER,            -- rbfCopnDt
  kis_grade    TEXT,               -- kisScrsItmsKcdNm
  kbp_grade    TEXT,               -- kbpScrsItmsKcdNm
  nice_grade   TEXT,               -- niceScrsItmsKcdNm
  fn_grade     TEXT,               -- fnScrsItmsKcdNm
  PRIMARY KEY (isin_cd, valid_from)
) WITHOUT ROWID;

-- 일별 시세. PK 선행을 (isin_cd, bas_dt)로 두어 "한 종목의 시계열" 조회가
-- 별도 인덱스 없이 PK 레인지 스캔이 되게 한다.
-- 같은 basDt에 동일 isinCd가 KTS·일반채권 두 시장에 동시 존재하는 사례가 실측으로 확인됐으므로
-- mrkt_ctg를 반드시 PK에 포함한다 (빠지면 그 케이스에서 PK 충돌).
CREATE TABLE bond_price (
  isin_cd     TEXT    NOT NULL,        -- isinCd
  bas_dt      INTEGER NOT NULL,        -- basDt
  mrkt_ctg    INTEGER NOT NULL,        -- mrktCtg: 1=KTS 2=일반채권 3=소액채권 (src/lib/bond/market.ts)
  clpr_prc    REAL,                    -- clprPrc
  clpr_vs     REAL,                    -- clprVs
  clpr_bnf_rt REAL,                    -- clprBnfRt
  mkp_prc     REAL,                    -- mkpPrc
  mkp_bnf_rt  REAL,                    -- mkpBnfRt
  hipr_prc    REAL,                    -- hiprPrc
  hipr_bnf_rt REAL,                    -- hiprBnfRt
  lopr_prc    REAL,                    -- loprPrc
  lopr_bnf_rt REAL,                    -- loprBnfRt
  trqu        INTEGER,                 -- trqu
  tr_prc      INTEGER,                 -- trPrc
  xp_yr_cnt   REAL,                    -- xpYrCnt (KTS만 채워짐)
  itms_ctg    TEXT,                    -- itmsCtg (KTS만 채워짐)
  PRIMARY KEY (isin_cd, bas_dt, mrkt_ctg)
) WITHOUT ROWID;

-- 코드 → 한글 라벨 사전. domain은 camelCase 원본 코드 필드명(예: 'grnDcd').
CREATE TABLE code_label (
  domain TEXT NOT NULL,
  code   TEXT NOT NULL,
  label  TEXT NOT NULL,
  PRIMARY KEY (domain, code)
) WITHOUT ROWID;

-- cron 수집 커서·상태. 페이지 단위 재개와 시세/기본정보 우선순위 판단(src/lib/sync/plan.ts)의 근거.
CREATE TABLE sync_run (
  source       TEXT    NOT NULL,   -- 'issu' | 'price'
  bas_dt       INTEGER NOT NULL,
  status       TEXT    NOT NULL,   -- 'running' | 'done' | 'failed'
  next_page    INTEGER NOT NULL DEFAULT 1,
  total_count  INTEGER,
  rows_seen    INTEGER NOT NULL DEFAULT 0,
  rows_written INTEGER NOT NULL DEFAULT 0,
  attempt      INTEGER NOT NULL DEFAULT 1,
  started_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  finished_at  INTEGER,
  error        TEXT,
  PRIMARY KEY (source, bas_dt)
) WITHOUT ROWID;

-- 최신 스냅샷 키, 시세 API 보존 한계(백필 discover-range 결과) 등 잡다한 포인터.
CREATE TABLE app_meta (
  key        TEXT NOT NULL PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;
