/**
 * 스크리너 목록 스냅샷 빌드(`src/lib/snapshot/build.ts`)용 읽기 전용 D1 리포지토리.
 * `bond-repo.ts`(cron 쓰기 경로)·`detail-repo.ts`(상세 조회)와 섞지 않는다.
 *
 * 키셋 페이지네이션 — 호출자가 이전 청크의 마지막 `isin_cd`를 넘기면 그 다음 청크를
 * 반환한다(최초 호출은 `""`, 모든 실제 ISIN보다 사전순으로 작다). 반환 행 순서는
 * `isin_cd` 오름차순이 보장되어야 한다 — `src/lib/snapshot/encode.ts`의
 * `createSnapshotBuilder()`가 이 순서에 의존한다(발행인 사전 인덱스가 등장 순서로 결정됨).
 */
import {
  SNAPSHOT_BOND_CHANGED_SQL,
  SNAPSHOT_BOND_PAGE_SQL,
  SNAPSHOT_CODE_LABEL_SQL,
  SNAPSHOT_LATEST_PRICE_PAGE_SQL,
} from "./sql";

export interface SnapshotBondRow {
  isin_cd: string;
  isin_cd_nm: string;
  bond_isur_nm: string;
  scrs_itms_kcd: string | null;
  bond_issu_dt: number | null;
  bond_expr_dt: number | null;
  bond_srfc_inrt: number | null;
  bond_int_tcd: string | null;
  last_chg_bas_dt: number;
  bond_bal: number | null;
  kis_grade: string | null;
}

export interface SnapshotLatestPriceRow {
  isin_cd: string;
  bas_dt: number;
  mrkt_ctg: number;
  clpr_prc: number | null;
  clpr_vs: number | null;
  clpr_bnf_rt: number | null;
  trqu: number | null;
}

export interface SnapshotCodeLabelRow {
  domain: string;
  code: string;
  label: string;
}

export async function readSnapshotBondPage(
  db: D1Database,
  afterIsinCd: string,
  limit: number,
): Promise<SnapshotBondRow[]> {
  const result = await db.prepare(SNAPSHOT_BOND_PAGE_SQL).bind(afterIsinCd, limit).all<SnapshotBondRow>();
  return result.results;
}

export async function readSnapshotLatestPricePage(
  db: D1Database,
  afterIsinCd: string,
  limit: number,
): Promise<SnapshotLatestPriceRow[]> {
  const result = await db
    .prepare(SNAPSHOT_LATEST_PRICE_PAGE_SQL)
    .bind(afterIsinCd, limit)
    .all<SnapshotLatestPriceRow>();
  return result.results;
}

export async function readSnapshotCodeLabels(db: D1Database): Promise<SnapshotCodeLabelRow[]> {
  const result = await db.prepare(SNAPSHOT_CODE_LABEL_SQL).all<SnapshotCodeLabelRow>();
  return result.results;
}

/**
 * `basDt`에 변경된 bond 행 전부(`SNAPSHOT_BOND_CHANGED_SQL` 참고) — `src/lib/snapshot/bond-delta.ts`의
 * 일일 델타 소스. 단일 쿼리라 페이지네이션이 없다 — 호출부가 `limit`을 `BOND_DELTA_MAX_ROWS + 1`로
 * 걸어 "임계 초과"를 결과 길이로 판별한다.
 */
export async function readChangedBondRows(db: D1Database, basDt: number, limit: number): Promise<SnapshotBondRow[]> {
  const result = await db.prepare(SNAPSHOT_BOND_CHANGED_SQL).bind(basDt, limit).all<SnapshotBondRow>();
  return result.results;
}
