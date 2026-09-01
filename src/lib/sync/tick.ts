/**
 * cron `scheduled` 핸들러가 매분 호출하는 진입점.
 *
 * Workers Paid 전환(2026-09) 전에는 Free tier CPU 예산(10ms/invocation) 때문에 한 tick에
 * 페이지를 정확히 1개만 처리했다. Paid의 cron CPU 한도(30초)는 페이지당 실측 CPU(~12ms)에
 * 비해 충분히 크므로, 이제는 `TICK_WALL_BUDGET_MS`(wall-clock)·`MAX_PAGES_PER_TICK` 두
 * 예산 중 먼저 닿는 쪽까지 페이지를 이어 처리한다 — 오픈API 응답 지연(~500ms/페이지)이
 * 실질적인 상한이라 wall-clock으로 제어하는 게 맞다.
 */
import { getRunningSyncRun, getSyncRun, startSyncRun, type SyncRun, type SyncSource } from "@/lib/d1/sync-run-repo";
import { getAppMeta, setAppMeta } from "@/lib/d1/meta-repo";
import { buildAndPutSnapshot } from "@/lib/snapshot/build";
import { planTick } from "./plan";
import { previousBusinessDayKst } from "./dates";
import { runIssuSyncStep } from "./issu-sync";
import { runPriceSyncStep } from "./price-sync";
import { MAX_PAGES_PER_TICK, TICK_WALL_BUDGET_MS } from "./config";

export interface SyncEnv {
  DB: D1Database;
  ARCHIVE: R2Bucket;
  BOND_API_SERVICE_KEY: string;
}

/** `app_meta`에 스냅샷 진행 상태를 기록하는 키. `src/lib/d1/meta-repo.ts`가 CRUD를 제공. */
const SNAPSHOT_BAS_DT_META_KEY = "snapshot_bas_dt";
const SNAPSHOT_ATTEMPTS_META_KEY = "snapshot_attempts";

interface SnapshotAttempts {
  basDt: number;
  n: number;
}

function parseSnapshotAttempts(raw: string | null): SnapshotAttempts | null {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as SnapshotAttempts;
  } catch {
    return null;
  }
}

export async function runSyncTick(env: SyncEnv, scheduledTime: number): Promise<void> {
  const now = new Date(scheduledTime);
  const targetBasDt = previousBusinessDayKst(now);

  const runningRun = await getRunningSyncRun(env.DB);
  const priceRunToday = runningRun?.source === "price" ? runningRun : await getSyncRun(env.DB, "price", targetBasDt);
  const issuRunThisWeek = runningRun?.source === "issu" ? runningRun : await getSyncRun(env.DB, "issu", targetBasDt);

  const snapshotBasDtRaw = await getAppMeta(env.DB, SNAPSHOT_BAS_DT_META_KEY);
  const snapshotBasDt = snapshotBasDtRaw === null ? null : Number(snapshotBasDtRaw);
  const snapshotAttempts = parseSnapshotAttempts(await getAppMeta(env.DB, SNAPSHOT_ATTEMPTS_META_KEY));

  const action = planTick({ now, runningRun, priceRunToday, issuRunThisWeek, snapshotBasDt, snapshotAttempts });

  if (action.kind === "idle") {
    console.log("[sync] 오늘 할 일 없음");
    return;
  }

  if (action.kind === "snapshot") {
    await runSnapshotAction(env, action.basDt, Date.now());
    return;
  }

  let run: SyncRun;
  if (action.kind === "start") {
    await startSyncRun(env.DB, action.source, action.basDt, now.getTime());
    run = {
      source: action.source,
      bas_dt: action.basDt,
      status: "running",
      next_page: 1,
      total_count: null,
      rows_seen: 0,
      rows_written: 0,
      attempt: 1,
      started_at: now.getTime(),
      updated_at: now.getTime(),
      finished_at: null,
      error: null,
    };
  } else {
    const existing =
      runningRun && runningRun.source === action.source && runningRun.bas_dt === action.basDt
        ? runningRun
        : await getSyncRun(env.DB, action.source, action.basDt);
    if (!existing) {
      console.error(`[sync] resume 대상 run을 찾을 수 없음: ${action.source} ${action.basDt}`);
      return;
    }
    run = existing;
  }

  await runPagesUntilBudget(env, action.source, run);
}

/**
 * `run`이 가리키는 (source, basDt)의 페이지를 예산(wall-clock·페이지 수) 안에서 이어
 * 처리한다. 매 반복 후 D1에서 커서를 다시 읽어 진행 여부를 판단한다 — step이 반환하는
 * `done`만으로는 "backoff로 이번 페이지를 못 넘겼다"와 "페이지를 넘겼다"를 구분할 수
 * 없어서다(backoff는 `done:false`를 반환하되 D1의 `next_page`를 그대로 둔다). 커서가
 * 안 움직였으면 더 시도해도 소용없으니(같은 오픈API rate limit) 즉시 멈추고 다음 tick에
 * 맡긴다.
 */
async function runPagesUntilBudget(env: SyncEnv, source: SyncSource, initialRun: SyncRun): Promise<void> {
  const deadline = Date.now() + TICK_WALL_BUDGET_MS;
  let run = initialRun;
  let pages = 0;
  let totalQueries = 0;
  let lastDone: boolean;

  for (;;) {
    const beforePage = run.next_page;
    const result = source === "issu" ? await runIssuSyncStep(env, run) : await runPriceSyncStep(env, run);
    pages += 1;
    totalQueries += result.queriesUsed;
    lastDone = result.done;

    if (result.done) break;
    if (pages >= MAX_PAGES_PER_TICK) break;
    if (Date.now() >= deadline) break;

    const refreshed = await getSyncRun(env.DB, source, run.bas_dt);
    totalQueries += 1;
    if (!refreshed || refreshed.status !== "running" || refreshed.next_page === beforePage) break;
    run = refreshed;
  }

  console.log(
    `[sync] ${source} basDt=${run.bas_dt} pages=${pages} queries=${totalQueries} done=${lastDone} next_page=${run.next_page}`,
  );
}

async function runSnapshotAction(env: SyncEnv, basDt: number, now: number): Promise<void> {
  try {
    const result = await buildAndPutSnapshot(env);
    await setAppMeta(env.DB, SNAPSHOT_BAS_DT_META_KEY, String(result.basDt), now);
    // 성공했으니 실패 카운터를 이 basDt 기준으로 초기화해 둔다(다음 실패 집계가 섞이지 않게).
    await setAppMeta(env.DB, SNAPSHOT_ATTEMPTS_META_KEY, JSON.stringify({ basDt: result.basDt, n: 0 }), now);
    console.log(
      `[sync] snapshot basDt=${result.basDt} bond=${result.bondCount} price=${result.priceCount} bytes=${result.bytes}`,
    );
  } catch (err) {
    const prev = parseSnapshotAttempts(await getAppMeta(env.DB, SNAPSHOT_ATTEMPTS_META_KEY));
    const n = prev && prev.basDt === basDt ? prev.n + 1 : 1;
    await setAppMeta(env.DB, SNAPSHOT_ATTEMPTS_META_KEY, JSON.stringify({ basDt, n }), now);
    console.error(
      `[sync] snapshot 실패(시도 ${n}) basDt=${basDt}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
