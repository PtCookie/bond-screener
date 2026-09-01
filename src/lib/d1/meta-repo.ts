/**
 * `app_meta`(잡다한 키-값 포인터 테이블, `migrations/0001_init.sql`) CRUD. 첫 사용처는
 * cron 스냅샷 단계(`src/lib/sync/plan.ts`/`tick.ts`) — 마지막으로 빌드한 스냅샷의 basDt와
 * 실패 재시도 횟수를 기록해, 스냅샷 전용 `sync_run` 없이도 멱등하게 재시도할 수 있게 한다.
 */

export async function getAppMeta(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM app_meta WHERE key = ?1").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function setAppMeta(db: D1Database, key: string, value: string, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO app_meta (key, value, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(key, value, now)
    .run();
}
