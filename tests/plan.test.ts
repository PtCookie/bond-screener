import { describe, expect, test } from "vitest";
import type { SyncRun } from "@/lib/d1/sync-run-repo";
import { planTick } from "@/lib/sync/plan";

function run(overrides: Partial<SyncRun>): SyncRun {
  return {
    source: "price",
    bas_dt: 20260821,
    status: "running",
    next_page: 1,
    total_count: null,
    rows_seen: 0,
    rows_written: 0,
    attempt: 1,
    started_at: 0,
    updated_at: 0,
    finished_at: null,
    error: null,
    ...overrides,
  };
}

// 2026-08-24T01:00:00Z = KST 2026-08-24 10:00, 월요일(수요일 아님).
const MONDAY = new Date("2026-08-24T01:00:00Z");
// 2026-08-26T01:00:00Z = KST 2026-08-26 10:00, 수요일(ISSU_SYNC_WEEKDAY_KST).
const WEDNESDAY = new Date("2026-08-26T01:00:00Z");

describe("planTick", () => {
  test("진행 중인 run이 있으면 무조건 이어서 처리 (source 무관)", () => {
    const running = run({ source: "issu", bas_dt: 20260821, status: "running" });
    const action = planTick({
      now: MONDAY,
      runningRun: running,
      priceRunToday: null,
      issuRunThisWeek: null,
    });
    expect(action).toEqual({ kind: "resume", source: "issu", basDt: 20260821 });
  });

  test("시세가 아직 시작 전이면 시세부터 시작", () => {
    const action = planTick({
      now: MONDAY,
      runningRun: null,
      priceRunToday: null,
      issuRunThisWeek: null,
    });
    expect(action.kind).toBe("start");
    expect(action.kind === "start" && action.source).toBe("price");
  });

  test("시세가 끝났고 오늘이 기본정보 요일이 아니면 idle", () => {
    const action = planTick({
      now: MONDAY,
      runningRun: null,
      priceRunToday: run({ status: "done" }),
      issuRunThisWeek: null,
    });
    expect(action).toEqual({ kind: "idle" });
  });

  test("시세가 끝났고 오늘이 기본정보 요일이면 기본정보 시작", () => {
    const action = planTick({
      now: WEDNESDAY,
      runningRun: null,
      priceRunToday: run({ status: "done", bas_dt: 20260825 }),
      issuRunThisWeek: null,
    });
    expect(action.kind).toBe("start");
    expect(action.kind === "start" && action.source).toBe("issu");
  });

  test("기본정보가 이미 이번 주에 시작됐으면(done이든 running이든) 새로 start하지 않는다", () => {
    const action = planTick({
      now: WEDNESDAY,
      runningRun: null,
      priceRunToday: run({ status: "done", bas_dt: 20260825 }),
      issuRunThisWeek: run({ source: "issu", status: "done", bas_dt: 20260825 }),
    });
    expect(action).toEqual({ kind: "idle" });
  });

  test("시세가 실패했어도(오늘 abort) 기본정보 요일이면 기본정보는 진행한다", () => {
    const action = planTick({
      now: WEDNESDAY,
      runningRun: null,
      priceRunToday: run({ status: "failed", bas_dt: 20260825 }),
      issuRunThisWeek: null,
    });
    expect(action.kind).toBe("start");
    expect(action.kind === "start" && action.source).toBe("issu");
  });

  test("시세가 empty(0건)로 끝났으면 재시도한다 — 데이터 발행 지연 복구", () => {
    // 실운영에서 실제로 발생한 케이스: 오픈API 갱신이 영업일+1일 오후 1시 이후라,
    // cron이 먼저 조회하면 0건이 온다. done으로 마감하면 다음 tick이 영영 재조회하지
    // 않으므로 empty는 null과 동일하게 재시도 대상이어야 한다.
    const action = planTick({
      now: MONDAY,
      runningRun: null,
      priceRunToday: run({ status: "empty", total_count: 0 }),
      issuRunThisWeek: null,
    });
    expect(action.kind).toBe("start");
    expect(action.kind === "start" && action.source).toBe("price");
  });

  test("기본정보가 empty로 끝났으면 같은 요일 안에서도 재시도한다", () => {
    const action = planTick({
      now: WEDNESDAY,
      runningRun: null,
      priceRunToday: run({ status: "done", bas_dt: 20260825 }),
      issuRunThisWeek: run({ source: "issu", status: "empty", bas_dt: 20260825, total_count: 0 }),
    });
    expect(action.kind).toBe("start");
    expect(action.kind === "start" && action.source).toBe("issu");
  });
});
