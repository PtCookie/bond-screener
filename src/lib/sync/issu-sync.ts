/** 기본정보 1페이지 처리 — fetch → D1 upsert → R2 원본 아카이브 → sync_run 커서 전진. */
import { fetchOpenApiPage } from "@/lib/openapi/client";
import { classify } from "@/lib/openapi/errors";
import { writeBondPage } from "@/lib/d1/bond-repo";
import { advanceSyncRun, failSyncRun, finishSyncRun, type SyncRun } from "@/lib/d1/sync-run-repo";
import { archiveRawResponse } from "@/lib/r2/archive";
import { ISSU_PAGE_SIZE } from "./config";
import { BOND_ISSU_INFO_BASE_URL, BOND_ISSU_INFO_OPERATION, type BondBasiInfoItem } from "@/api";

export interface IssuSyncStepResult {
  done: boolean;
  queriesUsed: number;
}

/** run의 `next_page` 하나를 처리한다. 호출자가 CPU 예산에 맞춰 루프를 제어한다. */
export async function runIssuSyncStep(
  env: { DB: D1Database; ARCHIVE: R2Bucket; BOND_API_SERVICE_KEY: string },
  run: SyncRun,
): Promise<IssuSyncStepResult> {
  const now = Date.now();

  let page;
  try {
    page = await fetchOpenApiPage<BondBasiInfoItem>({
      baseUrl: BOND_ISSU_INFO_BASE_URL,
      operation: BOND_ISSU_INFO_OPERATION,
      params: { basDt: run.bas_dt, numOfRows: ISSU_PAGE_SIZE, pageNo: run.next_page },
      serviceKey: env.BOND_API_SERVICE_KEY,
    });
  } catch (err) {
    const policy = classify(err);
    if (policy === "backoff") {
      // 커서를 그대로 두고 이번 tick만 포기 — 다음 tick에서 같은 페이지부터 재시도.
      return { done: false, queriesUsed: 0 };
    }
    if (policy === "retry") {
      // 1회 즉시 재시도.
      try {
        page = await fetchOpenApiPage<BondBasiInfoItem>({
          baseUrl: BOND_ISSU_INFO_BASE_URL,
          operation: BOND_ISSU_INFO_OPERATION,
          params: { basDt: run.bas_dt, numOfRows: ISSU_PAGE_SIZE, pageNo: run.next_page },
          serviceKey: env.BOND_API_SERVICE_KEY,
        });
      } catch (retryErr) {
        await failSyncRun(env.DB, "issu", run.bas_dt, String(retryErr), now);
        return { done: true, queriesUsed: 1 };
      }
    } else {
      // abort-today | fatal
      await failSyncRun(env.DB, "issu", run.bas_dt, String(err), now);
      return { done: true, queriesUsed: 1 };
    }
  }

  // fetch 이후(R2 아카이브 ~ D1 반영)도 실패할 수 있다 — 여기서 잡지 않으면 예외가
  // `ctx.waitUntil`에 삼켜지고 run이 `running`으로 영구 방치돼, `bas_dt` 필터 없는
  // `getRunningSyncRun`이 이후 모든 tick을 이 좀비 run에 묶어 버린다.
  try {
    await env.ARCHIVE.put(archiveRawResponse("issu", run.bas_dt, run.next_page), page.rawBody, {
      httpMetadata: { contentType: "application/json" },
    });

    const writeResult = await writeBondPage(env.DB, page.items, run.bas_dt);

    const isLastPage = run.next_page * ISSU_PAGE_SIZE >= page.totalCount;
    await advanceSyncRun(env.DB, "issu", run.bas_dt, {
      nextPage: run.next_page + 1,
      totalCount: page.totalCount,
      rowsSeenDelta: page.items.length,
      rowsWrittenDelta: writeResult.upserted,
      now,
    });

    if (isLastPage) {
      await finishSyncRun(env.DB, "issu", run.bas_dt, now, page.totalCount === 0);
    }

    return { done: isLastPage, queriesUsed: writeResult.queriesUsed + 2 };
  } catch (err) {
    await failSyncRun(env.DB, "issu", run.bas_dt, String(err), now);
    return { done: true, queriesUsed: 1 };
  }
}
