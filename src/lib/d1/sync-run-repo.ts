/** `sync_run` 커서 CRUD. cron의 페이지 재개와 시세/기본정보 우선순위 판단의 근거. */

export type SyncSource = "issu" | "price";
/**
 * `empty`: 조회 결과가 0건이라 이번 tick은 끝냈지만, 데이터가 아직 발행되지 않았을
 * 가능성이 있어(오픈API 갱신 지연) `done`과 달리 다음 tick에서 재시도 대상이 된다.
 * `planTick`이 `empty`를 `null`(미시작)과 동일하게 취급하는 게 이 구분의 핵심 용도다.
 */
export type SyncStatus = "running" | "done" | "empty" | "failed";

export interface SyncRun {
  source: SyncSource;
  bas_dt: number;
  status: SyncStatus;
  next_page: number;
  total_count: number | null;
  rows_seen: number;
  rows_written: number;
  attempt: number;
  started_at: number;
  updated_at: number;
  finished_at: number | null;
  error: string | null;
}

export async function getSyncRun(db: D1Database, source: SyncSource, basDt: number): Promise<SyncRun | null> {
  return db.prepare("SELECT * FROM sync_run WHERE source = ?1 AND bas_dt = ?2").bind(source, basDt).first<SyncRun>();
}

/** 오늘 `running` 상태인 run이 있으면 반환한다(source 무관 — 시세/기본정보 어느 쪽이든 이어서 처리). */
export async function getRunningSyncRun(db: D1Database): Promise<SyncRun | null> {
  return db.prepare("SELECT * FROM sync_run WHERE status = 'running' ORDER BY started_at ASC LIMIT 1").first<SyncRun>();
}

/**
 * `planTick`의 `start` 분기에서만 호출된다(resume은 이 함수를 거치지 않는다) — 즉 이전
 * 시도가 `empty`/`failed`로 끝난 뒤 같은 (source, bas_dt)를 처음부터 다시 도는 경우다.
 * 그래서 `ON CONFLICT`에서도 커서·누계·에러를 전부 리셋한다. 리셋하지 않으면 이전 시도의
 * `next_page`가 남아 `tick.ts`가 메모리에서 합성하는 `next_page: 1`과 어긋나고, 이후
 * `resume` 경로가 DB 값을 그대로 읽으면서 앞쪽 페이지를 영구히 건너뛴다(재현:
 * tests/workers/sync-run-repo.test.ts).
 */
export async function startSyncRun(db: D1Database, source: SyncSource, basDt: number, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sync_run (source, bas_dt, status, next_page, rows_seen, rows_written, attempt, started_at, updated_at)
       VALUES (?1, ?2, 'running', 1, 0, 0, 1, ?3, ?3)
       ON CONFLICT(source, bas_dt) DO UPDATE SET
         status = 'running', next_page = 1, total_count = NULL,
         rows_seen = 0, rows_written = 0, finished_at = NULL, error = NULL,
         attempt = attempt + 1, updated_at = ?3`,
    )
    .bind(source, basDt, now)
    .run();
}

export async function advanceSyncRun(
  db: D1Database,
  source: SyncSource,
  basDt: number,
  patch: {
    nextPage: number;
    totalCount: number;
    rowsSeenDelta: number;
    rowsWrittenDelta: number;
    now: number;
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE sync_run SET
         next_page = ?3, total_count = ?4,
         rows_seen = rows_seen + ?5, rows_written = rows_written + ?6,
         updated_at = ?7
       WHERE source = ?1 AND bas_dt = ?2`,
    )
    .bind(source, basDt, patch.nextPage, patch.totalCount, patch.rowsSeenDelta, patch.rowsWrittenDelta, patch.now)
    .run();
}

/**
 * @param isEmpty 이번 run의 `total_count`가 0이었는지. 오픈API 데이터 갱신이 "영업일+1일
 *   오후 1시 이후"라, cron이 아직 발행되지 않은 날짜를 조회하면 정상적으로 0건이 온다.
 *   이 경우 `done`이 아니라 `empty`로 마감해 다음 tick에서 다시 시도하게 한다 — 그렇지
 *   않으면 실제 데이터가 나온 뒤에도 영영 재조회하지 않는다(실운영에서 실제로 발생한 문제).
 */
export async function finishSyncRun(
  db: D1Database,
  source: SyncSource,
  basDt: number,
  now: number,
  isEmpty: boolean,
): Promise<void> {
  const status: SyncStatus = isEmpty ? "empty" : "done";
  await db
    .prepare(
      `UPDATE sync_run SET status = ?3, finished_at = ?4, updated_at = ?4
       WHERE source = ?1 AND bas_dt = ?2`,
    )
    .bind(source, basDt, status, now)
    .run();
}

export async function failSyncRun(
  db: D1Database,
  source: SyncSource,
  basDt: number,
  error: string,
  now: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE sync_run SET status = 'failed', error = ?3, updated_at = ?4
       WHERE source = ?1 AND bas_dt = ?2`,
    )
    .bind(source, basDt, error.slice(0, 500), now)
    .run();
}
