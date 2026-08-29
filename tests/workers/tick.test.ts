import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { env } from "cloudflare:workers";
import { runSyncTick } from "@/lib/sync/tick";
import { getRunningSyncRun, getSyncRun, startSyncRun, finishSyncRun } from "@/lib/d1/sync-run-repo";
import { resetD1 } from "./helpers/reset-d1";
import { buildEnvelope, buildErrorEnvelope, buildIssuItems, buildPriceItems } from "./helpers/envelope";
import { stubFetchOnce } from "./helpers/fetch-stub";

beforeEach(resetD1);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// KST 수요일 13:00 (ISSU_SYNC_WEEKDAY_KST=3). previousBusinessDayKst → 화요일(20260825).
const WEDNESDAY_SCHEDULED = new Date("2026-08-26T04:00:00Z").getTime();
const WEDNESDAY_TARGET_BAS_DT = 20260825;

// KST 목요일 13:00. previousBusinessDayKst → 수요일(20260826).
const THURSDAY_SCHEDULED = new Date("2026-08-27T04:00:00Z").getTime();
const THURSDAY_TARGET_BAS_DT = 20260826;

describe("runSyncTick — idle 경로", () => {
  test("오늘치 시세가 이미 done이고 이슈 요일도 아니면 아무 것도 시작하지 않는다", async () => {
    await startSyncRun(env.DB, "price", THURSDAY_TARGET_BAS_DT, 1000);
    await finishSyncRun(env.DB, "price", THURSDAY_TARGET_BAS_DT, 1500, false);

    await runSyncTick(env, THURSDAY_SCHEDULED);

    expect(await getRunningSyncRun(env.DB)).toBeNull();
    expect(await getSyncRun(env.DB, "issu", THURSDAY_TARGET_BAS_DT)).toBeNull();
  });
});

describe("runSyncTick — price 최초 시작부터 완료까지", () => {
  test("priceRunToday가 없으면 start해서 바로 done까지 처리한다", async () => {
    const items = buildPriceItems(2, String(THURSDAY_TARGET_BAS_DT));
    stubFetchOnce(200, buildEnvelope({ items, totalCount: 2 }));

    await runSyncTick(env, THURSDAY_SCHEDULED);

    const run = await getSyncRun(env.DB, "price", THURSDAY_TARGET_BAS_DT);
    expect(run?.status).toBe("done");

    const count = await env.DB.prepare("SELECT COUNT(*) c FROM bond_price").first<{ c: number }>();
    expect(count?.c).toBe(2);
  });
});

describe("runSyncTick — 버그 A 재현 시퀀스 (empty 마감 → 재시작 → backoff → resume)", () => {
  test("4틱을 거쳐도 page 1이 누락되지 않는다", async () => {
    // tick 1: 0건 응답 → empty 마감. advanceSyncRun이 먼저 next_page=2로 올린다.
    stubFetchOnce(200, buildEnvelope({ items: [], totalCount: 0 }));
    await runSyncTick(env, THURSDAY_SCHEDULED);

    const afterTick1 = await getSyncRun(env.DB, "price", THURSDAY_TARGET_BAS_DT);
    expect(afterTick1).toMatchObject({ status: "empty", next_page: 2 });

    // tick 2: empty는 재시작 대상 → startSyncRun이 next_page를 1로 리셋해야 한다(버그 A 수정).
    // 이 tick 자체는 backoff로 끝나 D1을 건드리지 않으므로, 커서는 리셋된 1에서 멈춰 있어야 한다.
    stubFetchOnce(200, buildErrorEnvelope("23", "LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR"));
    await runSyncTick(env, THURSDAY_SCHEDULED);

    const afterTick2 = await getSyncRun(env.DB, "price", THURSDAY_TARGET_BAS_DT);
    expect(afterTick2).toMatchObject({ status: "running", next_page: 1 });

    // tick 3: running이므로 resume. next_page=1로 재조회돼야 한다 — 리셋되지 않았다면
    // next_page=2로 남아 이 페이지(마커 종목 포함)를 영구히 건너뛴다.
    const markerItem = buildPriceItems(1, String(THURSDAY_TARGET_BAS_DT))[0];
    markerItem.isinCd = "KR_PAGE1_MARKER01";
    stubFetchOnce(200, buildEnvelope({ items: [markerItem], totalCount: 1 }));
    await runSyncTick(env, THURSDAY_SCHEDULED);

    const afterTick3 = await getSyncRun(env.DB, "price", THURSDAY_TARGET_BAS_DT);
    expect(afterTick3?.status).toBe("done");

    const marker = await env.DB.prepare("SELECT isin_cd FROM bond_price WHERE isin_cd = ?1")
      .bind("KR_PAGE1_MARKER01")
      .first();
    expect(marker).not.toBeNull(); // page 1이 실제로 반영됐다 — 누락되지 않음
  });
});

describe("runSyncTick — 수요일 우선순위: 시세가 끝난 뒤에만 기본정보가 시작된다", () => {
  test("오늘치 시세가 done이고 수요일이면 기본정보를 시작한다", async () => {
    await startSyncRun(env.DB, "price", WEDNESDAY_TARGET_BAS_DT, 500);
    await finishSyncRun(env.DB, "price", WEDNESDAY_TARGET_BAS_DT, 600, false);

    const items = buildIssuItems(2, String(WEDNESDAY_TARGET_BAS_DT));
    stubFetchOnce(200, buildEnvelope({ items, totalCount: 2 }));

    await runSyncTick(env, WEDNESDAY_SCHEDULED);

    const issuRun = await getSyncRun(env.DB, "issu", WEDNESDAY_TARGET_BAS_DT);
    expect(issuRun?.status).toBe("done");
    const count = await env.DB.prepare("SELECT COUNT(*) c FROM bond").first<{ c: number }>();
    expect(count?.c).toBe(2);
  });

  test("시세가 아직 시작 전이면(오늘 첫 tick) 수요일이어도 기본정보보다 시세가 먼저다", async () => {
    const items = buildPriceItems(1, String(WEDNESDAY_TARGET_BAS_DT));
    stubFetchOnce(200, buildEnvelope({ items, totalCount: 1 }));

    await runSyncTick(env, WEDNESDAY_SCHEDULED);

    const priceRun = await getSyncRun(env.DB, "price", WEDNESDAY_TARGET_BAS_DT);
    expect(priceRun?.status).toBe("done");
    expect(await getSyncRun(env.DB, "issu", WEDNESDAY_TARGET_BAS_DT)).toBeNull();
  });
});

describe("runSyncTick — running run 우선순위", () => {
  test("source/basDt와 무관하게 running run이 있으면 무조건 이어서 처리한다", async () => {
    // 오늘(target basDt)과 전혀 무관한 과거 basDt의 issu run이 running 상태로 남아 있다고 가정.
    const staleBasDt = 20200101;
    await startSyncRun(env.DB, "issu", staleBasDt, 100);

    const items = buildIssuItems(1, String(staleBasDt));
    stubFetchOnce(200, buildEnvelope({ items, totalCount: 1 }));

    await runSyncTick(env, THURSDAY_SCHEDULED);

    const staleRun = await getSyncRun(env.DB, "issu", staleBasDt);
    expect(staleRun?.status).toBe("done"); // resume이 처리됨

    // 오늘치 시세는 아예 건드리지 않았어야 한다 — running이 최우선이라 planTick이 시세 분기로 안 감.
    expect(await getSyncRun(env.DB, "price", THURSDAY_TARGET_BAS_DT)).toBeNull();
  });
});

describe("runSyncTick — scheduledTime과 Date.now()는 서로 다른 시계다", () => {
  test("started_at은 scheduledTime, updated_at은 실행 시점의 실제 시각을 쓴다", async () => {
    const items = buildPriceItems(1, String(THURSDAY_TARGET_BAS_DT));
    stubFetchOnce(200, buildEnvelope({ items, totalCount: 1 }));

    await runSyncTick(env, THURSDAY_SCHEDULED);

    const run = await getSyncRun(env.DB, "price", THURSDAY_TARGET_BAS_DT);
    expect(run?.started_at).toBe(THURSDAY_SCHEDULED);
    // updated_at은 issu-sync/price-sync 내부의 Date.now() — 테스트 실행 시점의 실제 시각이라
    // scheduledTime(고정된 과거 시각)과 같을 수 없다.
    expect(run?.updated_at).not.toBe(THURSDAY_SCHEDULED);
  });
});
