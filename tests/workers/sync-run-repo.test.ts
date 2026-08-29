import { beforeEach, describe, expect, test } from "vitest";
import { env } from "cloudflare:workers";
import {
  advanceSyncRun,
  failSyncRun,
  finishSyncRun,
  getRunningSyncRun,
  getSyncRun,
  startSyncRun,
} from "@/lib/d1/sync-run-repo";
import { resetD1 } from "./helpers/reset-d1";

// 스토리지 격리는 파일 단위라 test() 사이에 상태가 새지 않도록 매번 리셋한다.
beforeEach(resetD1);

describe("startSyncRun", () => {
  test("신규 (source, bas_dt)는 next_page=1, attempt=1인 running 행을 만든다", async () => {
    await startSyncRun(env.DB, "price", 20260821, 1000);

    const run = await getSyncRun(env.DB, "price", 20260821);
    expect(run).toMatchObject({
      source: "price",
      bas_dt: 20260821,
      status: "running",
      next_page: 1,
      rows_seen: 0,
      rows_written: 0,
      attempt: 1,
      started_at: 1000,
      updated_at: 1000,
      finished_at: null,
      error: null,
    });
  });

  test("empty 마감된 run을 재시작하면 커서·누계·에러가 리셋된다 (버그 A 회귀)", async () => {
    // empty 마감 직전까지의 상태를 재현: next_page가 전진해 있고, rows_*가 누적돼 있고,
    // 이전 시도의 error 문자열이 남아 있는 상황.
    await startSyncRun(env.DB, "price", 20260821, 1000);
    await advanceSyncRun(env.DB, "price", 20260821, {
      nextPage: 2,
      totalCount: 0,
      rowsSeenDelta: 0,
      rowsWrittenDelta: 0,
      now: 1100,
    });
    await failSyncRun(env.DB, "price", 20260821, "일시적 실패", 1150);
    await finishSyncRun(env.DB, "price", 20260821, 1200, true); // isEmpty=true → status='empty'

    const beforeRestart = await getSyncRun(env.DB, "price", 20260821);
    expect(beforeRestart).toMatchObject({ status: "empty", next_page: 2 });

    // planTick이 empty를 재시작 대상으로 보고 다시 startSyncRun을 호출하는 경로.
    await startSyncRun(env.DB, "price", 20260821, 2000);

    const run = await getSyncRun(env.DB, "price", 20260821);
    expect(run).toMatchObject({
      status: "running",
      next_page: 1, // 리셋되지 않으면 2로 남는다 — tick.ts가 메모리에서 합성하는 값과 어긋남
      total_count: null,
      rows_seen: 0,
      rows_written: 0,
      finished_at: null,
      error: null,
      attempt: 2, // 재시작 횟수는 계속 증가해야 한다
      started_at: 1000, // INSERT 시점 값은 그대로 (ON CONFLICT UPDATE는 started_at을 안 건드림)
      updated_at: 2000,
    });
  });

  test("failed 상태 재시작도 동일하게 리셋된다", async () => {
    await startSyncRun(env.DB, "issu", 20260821, 1000);
    await advanceSyncRun(env.DB, "issu", 20260821, {
      nextPage: 5,
      totalCount: 1000,
      rowsSeenDelta: 800,
      rowsWrittenDelta: 800,
      now: 1100,
    });
    await failSyncRun(env.DB, "issu", 20260821, "fatal 에러", 1200);

    await startSyncRun(env.DB, "issu", 20260821, 2000);

    const run = await getSyncRun(env.DB, "issu", 20260821);
    expect(run).toMatchObject({
      status: "running",
      next_page: 1,
      rows_seen: 0,
      rows_written: 0,
      error: null,
    });
  });
});

describe("advanceSyncRun", () => {
  test("rows_seen/rows_written은 증분 누적, next_page/total_count는 절대값 덮어쓰기", async () => {
    await startSyncRun(env.DB, "price", 20260821, 1000);
    await advanceSyncRun(env.DB, "price", 20260821, {
      nextPage: 2,
      totalCount: 332,
      rowsSeenDelta: 200,
      rowsWrittenDelta: 150,
      now: 1100,
    });
    await advanceSyncRun(env.DB, "price", 20260821, {
      nextPage: 3,
      totalCount: 332,
      rowsSeenDelta: 132,
      rowsWrittenDelta: 100,
      now: 1200,
    });

    const run = await getSyncRun(env.DB, "price", 20260821);
    expect(run).toMatchObject({
      next_page: 3,
      total_count: 332,
      rows_seen: 332, // 200 + 132
      rows_written: 250, // 150 + 100
      updated_at: 1200,
    });
  });
});

describe("finishSyncRun", () => {
  test("isEmpty=false → done", async () => {
    await startSyncRun(env.DB, "price", 20260821, 1000);
    await finishSyncRun(env.DB, "price", 20260821, 2000, false);

    const run = await getSyncRun(env.DB, "price", 20260821);
    expect(run).toMatchObject({ status: "done", finished_at: 2000, updated_at: 2000 });
  });

  test("isEmpty=true → empty (오픈API 데이터 미발행 — 다음 tick 재시도 대상)", async () => {
    await startSyncRun(env.DB, "price", 20260821, 1000);
    await finishSyncRun(env.DB, "price", 20260821, 2000, true);

    const run = await getSyncRun(env.DB, "price", 20260821);
    expect(run?.status).toBe("empty");
  });
});

describe("failSyncRun", () => {
  test("error 메시지를 500자로 절단한다", async () => {
    await startSyncRun(env.DB, "price", 20260821, 1000);
    const longError = "x".repeat(600);
    await failSyncRun(env.DB, "price", 20260821, longError, 2000);

    const run = await getSyncRun(env.DB, "price", 20260821);
    expect(run?.status).toBe("failed");
    expect(run?.error).toHaveLength(500);
    expect(run?.error).toBe("x".repeat(500));
  });
});

describe("getRunningSyncRun", () => {
  test("running 행이 없으면 null", async () => {
    expect(await getRunningSyncRun(env.DB)).toBeNull();
  });

  test("source 무관, started_at이 가장 오래된 running 행 하나를 반환한다", async () => {
    await startSyncRun(env.DB, "issu", 20260819, 1000); // 가장 오래됨 — 이게 반환돼야 함
    await startSyncRun(env.DB, "price", 20260821, 2000);
    await finishSyncRun(env.DB, "price", 20260821, 2500, false); // done으로 마감 → 후보에서 제외
    await startSyncRun(env.DB, "price", 20260820, 3000); // running이지만 issu보다 늦게 시작

    const running = await getRunningSyncRun(env.DB);
    expect(running).toMatchObject({ source: "issu", bas_dt: 20260819, started_at: 1000 });
  });
});
