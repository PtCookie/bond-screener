-- 상세 페이지(`/bond/[id]`) E2E용 D1 픽스처. `scripts/seed-e2e.mjs`가 E2E 전용
-- persist 경로(`.wrangler/e2e-state`)에 마이그레이션을 적용한 뒤 이 파일을 넣는다 —
-- 개발용 실데이터 D1(`.wrangler/state`, `pnpm seed:local`)은 건드리지 않는다.
--
-- 목록 화면은 `/api/snapshot/*`를 page.route()로 모킹하지만(`./snapshot.ts`) 상세 페이지는
-- SSR이 D1을 직접 타 모킹이 닿지 않는다 — 그래서 여기에 종목 하나를 실제로 심는다.
--
-- **`./snapshot.ts`의 `makeBonds()` 첫 종목과 정체성(ISIN·종목명·발행인)이 일치해야 한다.**
-- 목록에서 클릭해 들어간 종목이 상세에서도 같은 이름으로 보여야 `navigation.spec.ts`의
-- 단언이 성립한다. 한쪽만 고치면 그 테스트가 즉시 깨지므로 드리프트는 조용히 숨지 않는다.
--
-- 전부 INSERT OR REPLACE — 시드 스크립트를 몇 번 돌려도 결과가 같다.

-- 컬럼은 명시 나열한다. `bond`의 컬럼 순서는 `src/lib/bond/columns.ts`의 BOND_COLUMNS가
-- 정본이라(json_each 인덱스와 묶여 있다) 위치 기반 삽입은 깨지기 쉽다.
INSERT OR REPLACE INTO bond (
  isin_cd, crno, isin_cd_nm, bond_isur_nm, srtn_cd, itms_nm, sic_nm,
  scrs_itms_kcd, bond_issu_cur_cd, bond_issu_dt, bond_expr_dt, lstg_dt,
  bond_srfc_inrt, grn_dcd, bond_rnkn_dcd, txtn_dcd, bond_int_tcd,
  int_pay_mmnt_dcd, int_pay_cycl_ctt, bond_issu_amt, bond_pymt_amt,
  first_seen_bas_dt, last_chg_bas_dt, fp
) VALUES (
  'KR0000000000', '1101110000000', '유일채권0', '삼성전자', 'E2E000001', '유일채권0', '전자부품 제조업',
  '1108', 'KRW', 20240101, 20270101, 20240102,
  3.0, '4', '1', '1', '1',
  '01', '3', 100000000000, 100000000000,
  20260828, 20260828, 0
);

-- 이력이 2행 이상이라야 `BondStateHistory` 표가 렌더된다(1행이면 상위 섹션과 중복이라 생략).
INSERT OR REPLACE INTO bond_state (isin_cd, valid_from, valid_to, bond_bal, nxtm_copn_dt, rbf_copn_dt, kis_grade, kbp_grade, nice_grade, fn_grade) VALUES
  ('KR0000000000', 20240101, 20260827, 100000000000, 20260401, 20260101, 'AA+', 'AA+', 'AA+', 'AA+'),
  ('KR0000000000', 20260828, NULL,      90000000000, 20261001, 20260401, 'AAA', 'AAA', 'AAA', 'AAA');

-- mrkt_ctg는 정수 코드다(1=KTS, 2=일반채권, 3=소액채권 — `src/lib/bond/market.ts`).
-- 최신 bas_dt(20260828)에 두 시장을 함께 두어 "같은 날 KTS·일반채권 동시 존재"(bond_price PK
-- 주석) 경로까지 덮고, 이전 날짜들은 `PriceChartCard`가 부르는 시계열(/api/bond/[id]/prices)용이다.
INSERT OR REPLACE INTO bond_price (isin_cd, bas_dt, mrkt_ctg, clpr_prc, clpr_vs, clpr_bnf_rt, mkp_prc, mkp_bnf_rt, hipr_prc, hipr_bnf_rt, lopr_prc, lopr_bnf_rt, trqu, tr_prc, xp_yr_cnt, itms_ctg) VALUES
  ('KR0000000000', 20260826, 2, 10120.0, -5.0, 3.42, 10125.0, 3.40, 10130.0, 3.38, 10118.0, 3.44, 1200, 121440000, NULL, NULL),
  ('KR0000000000', 20260827, 2, 10135.0, 15.0, 3.35, 10122.0, 3.41, 10140.0, 3.33, 10120.0, 3.42, 2400, 243240000, NULL, NULL),
  ('KR0000000000', 20260828, 1, 10150.0, 15.0, 3.30, 10136.0, 3.35, 10152.0, 3.29, 10133.0, 3.36,  800,  81200000, 0.34, '지표'),
  ('KR0000000000', 20260828, 2, 10148.0, 13.0, 3.31, 10135.0, 3.35, 10150.0, 3.30, 10132.0, 3.36, 3600, 365328000, NULL, NULL);

-- 위 bond 행에 실제로 등장하는 코드만 — 상세 페이지의 라벨 조회(CODE_LABEL_BY_PAIRS_SQL)용.
INSERT OR REPLACE INTO code_label (domain, code, label) VALUES
  ('scrsItmsKcd',   '1108', '일반회사채'),
  ('bondIssuCurCd', 'KRW',  'KRW'),
  ('grnDcd',        '4',    '일반'),
  ('bondRnknDcd',   '1',    '선순위'),
  ('txtnDcd',       '1',    '과세'),
  ('bondIntTcd',    '1',    '이표채'),
  ('intPayMmntDcd', '01',   '후급');
