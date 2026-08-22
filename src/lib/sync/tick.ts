/**
 * cron `scheduled` 핸들러가 매분 호출하는 진입점. **한 tick에 정확히 페이지 1개만 처리한다** —
 * `ISSU_PAGE_SIZE=200`(~5ms)이 Free tier CPU 예산 10ms의 절반 수준이 되도록 잡았으므로,
 * 여러 페이지를 한 invocation에서 루프 돌리지 않는다. 기본정보 전량 갱신은
 * `29,087 ÷ 200 ≈ 146번의 tick`(146분)에 걸쳐 자연스럽게 끝난다.
 */
import { getRunningSyncRun, getSyncRun, startSyncRun, type SyncRun } from "@/lib/d1/sync-run-repo";
import { planTick } from "./plan";
import { previousBusinessDayKst } from "./dates";
import { runIssuSyncStep } from "./issu-sync";
import { runPriceSyncStep } from "./price-sync";

export interface SyncEnv {
  DB: D1Database;
  ARCHIVE: R2Bucket;
  BOND_API_SERVICE_KEY: string;
}

export async function runSyncTick(env: SyncEnv, scheduledTime: number): Promise<void> {
  const now = new Date(scheduledTime);
  const targetBasDt = previousBusinessDayKst(now);

  const runningRun = await getRunningSyncRun(env.DB);
  const priceRunToday = runningRun?.source === "price" ? runningRun : await getSyncRun(env.DB, "price", targetBasDt);
  const issuRunThisWeek = runningRun?.source === "issu" ? runningRun : await getSyncRun(env.DB, "issu", targetBasDt);

  const action = planTick({ now, runningRun, priceRunToday, issuRunThisWeek });

  if (action.kind === "idle") {
    console.log("[sync] 오늘 할 일 없음");
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

  const result = action.source === "issu" ? await runIssuSyncStep(env, run) : await runPriceSyncStep(env, run);

  console.log(
    `[sync] ${action.source} basDt=${run.bas_dt} page=${run.next_page} done=${result.done} queries=${result.queriesUsed}`,
  );
}
