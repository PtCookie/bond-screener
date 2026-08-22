-- 백필 완료 후에만 적용할 것.
--
-- D1은 write마다 인덱스 컬럼이 걸리면 대상 테이블 행 + 인덱스 행, 총 2배로 rows written이
-- 잡힌다(Cloudflare 과금 문서: "Indexes will add an additional written row when writes include
-- the indexed column"). 백필 중에 인덱스가 있으면 write 한도(100,000/일) 분할 계획이 절반으로
-- 줄어들므로, 반드시 bond 전량 적재가 끝난 뒤 이 파일을 migrations/ 로 옮겨 적용한다.
--
-- 사용법: mv migrations/pending/0002_indexes.sql migrations/0002_indexes.sql
--         wrangler d1 migrations apply bond-screener --remote --config ./wrangler.jsonc

-- 잔존만기 컬럼을 별도로 두지 않는 대신, 만기일 범위 필터로 등가 변환한다.
CREATE INDEX idx_bond_expr_dt ON bond (bond_expr_dt);

-- 단축코드(srtnCd)로 종목 상세에 진입하는 경로. 시세 API에서만 채워지므로 NULL 제외.
CREATE UNIQUE INDEX idx_bond_srtn_cd ON bond (srtn_cd) WHERE srtn_cd IS NOT NULL;

-- bond_price/bond_state에는 보조 인덱스를 두지 않는다:
--   - bond_price PK (isin_cd, bas_dt, mrkt_ctg) 자체가 "종목별 시계열" 조회의 레인지 스캔이 됨
--   - bond_state는 종목당 이력 행이 애초에 한 자릿수라 부분 인덱스의 이득이 없음
