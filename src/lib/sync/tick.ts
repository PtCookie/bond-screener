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
import { buildAndPutBondDelta } from "@/lib/snapshot/bond-delta";
import { planTick, type AttemptCounter } from "./plan";
import { previousBusinessDayKst } from "./dates";
import { runIssuSyncStep } from "./issu-sync";
import { runPriceSyncStep } from "./price-sync";
import { MAX_PAGES_PER_TICK, TICK_WALL_BUDGET_MS } from "./config";

export interface SyncEnv {
  DB: D1Database;
  ARCHIVE: R2Bucket;
  BOND_API_SERVICE_KEY: string;
}

/** `app_meta`에 스냅샷/델타 진행 상태를 기록하는 키. `src/lib/d1/meta-repo.ts`가 CRUD를 제공. */
const SNAPSHOT_BAS_DT_META_KEY = "snapshot_bas_dt";
const SNAPSHOT_ATTEMPTS_META_KEY = "snapshot_attempts";
const BOND_DELTA_BAS_DT_META_KEY = "bond_delta_bas_dt";
const BOND_DELTA_ATTEMPTS_META_KEY = "bond_delta_attempts";

function parseAttempts(raw: string | null): AttemptCounter | null {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as AttemptCounter;
  } catch {
    return null;
  }
}

export async function runSyncTick(env: SyncEnv, scheduledTime: number): Promise<void> {
  const now = new Date(scheduledTime);
  const targetBasDt = previousBusinessDayKst(now);

  const runningRun = await getRunningSyncRun(env.DB);
  const priceRunToday = runningRun?.source === "price" ? runningRun : await getSyncRun(env.DB, "price", targetBasDt);
  const issuRunToday = runningRun?.source === "issu" ? runningRun : await getSyncRun(env.DB, "issu", targetBasDt);

  const snapshotBasDtRaw = await getAppMeta(env.DB, SNAPSHOT_BAS_DT_META_KEY);
  const snapshotBasDt = snapshotBasDtRaw === null ? null : Number(snapshotBasDtRaw);
  const snapshotAttempts = parseAttempts(await getAppMeta(env.DB, SNAPSHOT_ATTEMPTS_META_KEY));

  const bondDeltaBasDtRaw = await getAppMeta(env.DB, BOND_DELTA_BAS_DT_META_KEY);
  const bondDeltaBasDt = bondDeltaBasDtRaw === null ? null : Number(bondDeltaBasDtRaw);
  const bondDeltaAttempts = parseAttempts(await getAppMeta(env.DB, BOND_DELTA_ATTEMPTS_META_KEY));

  const action = planTick({
    now,
    runningRun,
    priceRunToday,
    issuRunToday,
    snapshotBasDt,
    snapshotAttempts,
    bondDeltaBasDt,
    bondDeltaAttempts,
  });

  if (action.kind === "idle") {
    console.log("[sync] 오늘 할 일 없음");
    return;
  }

  if (action.kind === "snapshot") {
    await runSnapshotAction(env, action.basDt, Date.now());
    return;
  }

  if (action.kind === "bondDelta") {
    await runBondDeltaAction(env, action.basDt, Date.now());
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

/**
 * base 스냅샷 전량 재빌드. `basDt`는 `planTick`이 건넨 "수집 대상" basDt(issu run의
 * basDt)다 — `buildAndPutSnapshot`이 이 값을 R2 키·index의 basDt로 그대로 쓰고
 * (`src/lib/snapshot/build.ts` 참고), 여기서도 그 값을 그대로 `app_meta`에 기록한다.
 * 빌드 결과(`result.basDt`)를 대신 쓰면 안 된다 — 지금은 `buildAndPutSnapshot`이 인자로
 * 받은 `basDt`를 그대로 반환하므로 값 자체는 같지만, "무엇을 기록하는가"의 정본은 항상
 * planTick이 판단에 쓰는 액션의 basDt여야 한다(그래야 이 basDt와 `sync_run`의 basDt가
 * 구조적으로 어긋날 수 없다).
 */
async function runSnapshotAction(env: SyncEnv, basDt: number, now: number): Promise<void> {
  try {
    const result = await buildAndPutSnapshot(env, basDt);
    await setAppMeta(env.DB, SNAPSHOT_BAS_DT_META_KEY, String(basDt), now);
    // 성공했으니 실패 카운터를 이 basDt 기준으로 초기화해 둔다(다음 실패 집계가 섞이지 않게).
    await setAppMeta(env.DB, SNAPSHOT_ATTEMPTS_META_KEY, JSON.stringify({ basDt, n: 0 }), now);
    console.log(
      `[sync] snapshot basDt=${result.basDt} bond=${result.bondCount} price=${result.priceCount} bytes=${result.bytes}`,
    );
  } catch (err) {
    const prev = parseAttempts(await getAppMeta(env.DB, SNAPSHOT_ATTEMPTS_META_KEY));
    const n = prev && prev.basDt === basDt ? prev.n + 1 : 1;
    await setAppMeta(env.DB, SNAPSHOT_ATTEMPTS_META_KEY, JSON.stringify({ basDt, n }), now);
    console.error(
      `[sync] snapshot 실패(시도 ${n}) basDt=${basDt}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * 그날 변경된 종목만 담은 bond 델타를 올린다(`src/lib/snapshot/bond-delta.ts`). 변경분이
 * `BOND_DELTA_MAX_ROWS`를 넘으면(`tooLarge`) 델타 대신 전량 재빌드로 폴백한다 — 그 지점부터는
 * 델타가 base에 근접해 base+delta 구조의 이점이 사라지므로 차라리 base를 다시 굳히는
 * 편이 낫다. 폴백 성공/실패 회계는 `runSnapshotAction`과 동일하게 `snapshot_bas_dt`/
 * `snapshot_attempts`에 기록한다 — bond 델타 액션이되 실제로는 스냅샷 액션을 수행한
 * 것이므로 스냅샷 쪽 상태를 갱신하는 게 맞다(다음 tick의 `planTick`이 그 기준으로 판단한다).
 */
async function runBondDeltaAction(env: SyncEnv, basDt: number, now: number): Promise<void> {
  try {
    const result = await buildAndPutBondDelta(env, basDt);
    if (result.tooLarge) {
      console.warn(`[sync] bond delta 임계 초과 — 전량 재빌드로 폴백 basDt=${basDt}`);
      await runSnapshotAction(env, basDt, now);
      return;
    }
    await setAppMeta(env.DB, BOND_DELTA_BAS_DT_META_KEY, String(basDt), now);
    await setAppMeta(env.DB, BOND_DELTA_ATTEMPTS_META_KEY, JSON.stringify({ basDt, n: 0 }), now);
    console.log(`[sync] bondDelta basDt=${basDt} count=${result.count} bytes=${result.bytes}`);
  } catch (err) {
    const prev = parseAttempts(await getAppMeta(env.DB, BOND_DELTA_ATTEMPTS_META_KEY));
    const n = prev && prev.basDt === basDt ? prev.n + 1 : 1;
    await setAppMeta(env.DB, BOND_DELTA_ATTEMPTS_META_KEY, JSON.stringify({ basDt, n }), now);
    console.error(
      `[sync] bondDelta 실패(시도 ${n}) basDt=${basDt}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
