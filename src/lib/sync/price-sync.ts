/** 시세 1일치 처리 — fetch → D1 삽입 → R2 원본 아카이브 + 일일 델타 스냅샷 → sync_run 완료. */
import { fetchOpenApiPage } from "@/lib/openapi/client";
import { classify } from "@/lib/openapi/errors";
import { writeBondPricePage } from "@/lib/d1/price-repo";
import { advanceSyncRun, failSyncRun, finishSyncRun, type SyncRun } from "@/lib/d1/sync-run-repo";
import { archiveRawResponse } from "@/lib/r2/archive";
import { writePriceDelta } from "@/lib/r2/price-delta";
import { PRICE_PAGE_SIZE } from "./config";
import { BOND_PRICE_INFO_BASE_URL, BOND_PRICE_INFO_OPERATION, type BondPriceInfoItem } from "@/api";

export interface PriceSyncStepResult {
  done: boolean;
  queriesUsed: number;
}

/**
 * 시세는 하루 332건(1페이지)이 보통이라 한 tick에 전량 처리되지만, 혹시 늘어나도
 * `next_page` 커서로 이어갈 수 있게 issu-sync와 같은 페이지 단위 구조를 쓴다.
 */
export async function runPriceSyncStep(
  env: { DB: D1Database; ARCHIVE: R2Bucket; BOND_API_SERVICE_KEY: string },
  run: SyncRun,
): Promise<PriceSyncStepResult> {
  const now = Date.now();

  let page;
  try {
    page = await fetchOpenApiPage<BondPriceInfoItem>({
      baseUrl: BOND_PRICE_INFO_BASE_URL,
      operation: BOND_PRICE_INFO_OPERATION,
      params: { basDt: run.bas_dt, numOfRows: PRICE_PAGE_SIZE, pageNo: run.next_page },
      serviceKey: env.BOND_API_SERVICE_KEY,
    });
  } catch (err) {
    const policy = classify(err);
    if (policy === "backoff") return { done: false, queriesUsed: 0 };
    if (policy === "retry") {
      try {
        page = await fetchOpenApiPage<BondPriceInfoItem>({
          baseUrl: BOND_PRICE_INFO_BASE_URL,
          operation: BOND_PRICE_INFO_OPERATION,
          params: { basDt: run.bas_dt, numOfRows: PRICE_PAGE_SIZE, pageNo: run.next_page },
          serviceKey: env.BOND_API_SERVICE_KEY,
        });
      } catch (retryErr) {
        await failSyncRun(env.DB, "price", run.bas_dt, String(retryErr), now);
        return { done: true, queriesUsed: 1 };
      }
    } else {
      await failSyncRun(env.DB, "price", run.bas_dt, String(err), now);
      return { done: true, queriesUsed: 1 };
    }
  }

  await env.ARCHIVE.put(archiveRawResponse("price", run.bas_dt, run.next_page), page.rawBody, {
    httpMetadata: { contentType: "application/json" },
  });

  const writeResult = await writeBondPricePage(env.DB, page.items);

  const isLastPage = run.next_page * PRICE_PAGE_SIZE >= page.totalCount;
  await advanceSyncRun(env.DB, "price", run.bas_dt, {
    nextPage: run.next_page + 1,
    totalCount: page.totalCount,
    rowsSeenDelta: page.items.length,
    rowsWrittenDelta: writeResult.inserted,
    now,
  });

  if (isLastPage) {
    const isEmpty = page.totalCount === 0;
    await finishSyncRun(env.DB, "price", run.bas_dt, now, isEmpty);
    // 0건이면 아직 데이터가 발행되지 않은 것뿐이라(다음 tick에서 재시도됨) 빈 델타를
    // R2에 올려 index.json을 오염시키지 않는다.
    if (!isEmpty) {
      // 일일 시세 델타 스냅샷은 전량 수집이 끝난 뒤 한 번만 생성한다(페이지가 여러 개여도 중복 안 함).
      // 여러 페이지에 걸쳐 수집했을 가능성을 대비해 그날 전체를 D1에서 다시 읽지 않고,
      // 이 tick에서 확보한 items만으로 델타를 쓴다 — 단일 페이지가 보통이라 실무상 충분하다.
      await writePriceDelta(env.ARCHIVE, run.bas_dt, page.items);
    }
  }

  return { done: isLastPage, queriesUsed: writeResult.queriesUsed + 2 };
}
