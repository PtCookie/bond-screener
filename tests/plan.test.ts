import { describe, expect, test } from "vitest";
import type { SyncRun } from "@/lib/d1/sync-run-repo";
import { planTick, type PlanTickInput } from "@/lib/sync/plan";

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

/** 스냅샷 관련 필드의 기본값(미빌드·미실패)을 채운 뒤 오버라이드를 적용한다. */
function input(overrides: Partial<PlanTickInput> & Pick<PlanTickInput, "now">): PlanTickInput {
  return {
    runningRun: null,
    priceRunToday: null,
    issuRunThisWeek: null,
    snapshotBasDt: null,
    snapshotAttempts: null,
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
    const action = planTick(input({ now: MONDAY, runningRun: running }));
    expect(action).toEqual({ kind: "resume", source: "issu", basDt: 20260821 });
  });

  test("시세가 아직 시작 전이면 시세부터 시작", () => {
    const action = planTick(input({ now: MONDAY }));
    expect(action.kind).toBe("start");
    expect(action.kind === "start" && action.source).toBe("price");
  });

  test("시세가 끝났고 오늘이 기본정보 요일이 아니면 idle", () => {
    const action = planTick(input({ now: MONDAY, priceRunToday: run({ status: "done" }) }));
    expect(action).toEqual({ kind: "idle" });
  });

  test("시세가 끝났고 오늘이 기본정보 요일이면 기본정보 시작", () => {
    const action = planTick(input({ now: WEDNESDAY, priceRunToday: run({ status: "done", bas_dt: 20260825 }) }));
    expect(action.kind).toBe("start");
    expect(action.kind === "start" && action.source).toBe("issu");
  });

  test("기본정보가 이미 이번 주에 시작됐고(running) 스냅샷 대상이 아니면 idle", () => {
    const action = planTick(
      input({
        now: WEDNESDAY,
        priceRunToday: run({ status: "done", bas_dt: 20260825 }),
        issuRunThisWeek: run({ source: "issu", status: "running", bas_dt: 20260825 }),
      }),
    );
    expect(action).toEqual({ kind: "idle" });
  });

  test("시세가 실패했어도(오늘 abort) 기본정보 요일이면 기본정보는 진행한다", () => {
    const action = planTick(input({ now: WEDNESDAY, priceRunToday: run({ status: "failed", bas_dt: 20260825 }) }));
    expect(action.kind).toBe("start");
    expect(action.kind === "start" && action.source).toBe("issu");
  });

  test("시세가 empty(0건)로 끝났으면 재시도한다 — 데이터 발행 지연 복구", () => {
    // 실운영에서 실제로 발생한 케이스: 오픈API 갱신이 영업일+1일 오후 1시 이후라,
    // cron이 먼저 조회하면 0건이 온다. done으로 마감하면 다음 tick이 영영 재조회하지
    // 않으므로 empty는 null과 동일하게 재시도 대상이어야 한다.
    const action = planTick(input({ now: MONDAY, priceRunToday: run({ status: "empty", total_count: 0 }) }));
    expect(action.kind).toBe("start");
    expect(action.kind === "start" && action.source).toBe("price");
  });

  test("기본정보가 empty로 끝났으면 같은 요일 안에서도 재시도한다", () => {
    const action = planTick(
      input({
        now: WEDNESDAY,
        priceRunToday: run({ status: "done", bas_dt: 20260825 }),
        issuRunThisWeek: run({ source: "issu", status: "empty", bas_dt: 20260825, total_count: 0 }),
      }),
    );
    expect(action.kind).toBe("start");
    expect(action.kind === "start" && action.source).toBe("issu");
  });

  test("기본정보가 done이고 그 basDt로 아직 스냅샷을 안 만들었으면 스냅샷 빌드", () => {
    const action = planTick(
      input({
        now: WEDNESDAY,
        priceRunToday: run({ status: "done", bas_dt: 20260825 }),
        issuRunThisWeek: run({ source: "issu", status: "done", bas_dt: 20260825 }),
      }),
    );
    expect(action).toEqual({ kind: "snapshot", basDt: 20260825 });
  });

  test("기본정보가 done이고 같은 basDt로 이미 스냅샷을 만들었으면 idle", () => {
    const action = planTick(
      input({
        now: WEDNESDAY,
        priceRunToday: run({ status: "done", bas_dt: 20260825 }),
        issuRunThisWeek: run({ source: "issu", status: "done", bas_dt: 20260825 }),
        snapshotBasDt: 20260825,
      }),
    );
    expect(action).toEqual({ kind: "idle" });
  });

  test("스냅샷 실패가 SNAPSHOT_MAX_ATTEMPTS 미만이면 재시도한다", () => {
    const action = planTick(
      input({
        now: WEDNESDAY,
        priceRunToday: run({ status: "done", bas_dt: 20260825 }),
        issuRunThisWeek: run({ source: "issu", status: "done", bas_dt: 20260825 }),
        snapshotAttempts: { basDt: 20260825, n: 2 },
      }),
    );
    expect(action).toEqual({ kind: "snapshot", basDt: 20260825 });
  });

  test("스냅샷 실패가 SNAPSHOT_MAX_ATTEMPTS에 도달하면 포기하고 idle", () => {
    const action = planTick(
      input({
        now: WEDNESDAY,
        priceRunToday: run({ status: "done", bas_dt: 20260825 }),
        issuRunThisWeek: run({ source: "issu", status: "done", bas_dt: 20260825 }),
        snapshotAttempts: { basDt: 20260825, n: 3 },
      }),
    );
    expect(action).toEqual({ kind: "idle" });
  });

  test("다른 basDt의 실패 이력은 이번 basDt 재시도 판단에 영향을 주지 않는다", () => {
    const action = planTick(
      input({
        now: WEDNESDAY,
        priceRunToday: run({ status: "done", bas_dt: 20260825 }),
        issuRunThisWeek: run({ source: "issu", status: "done", bas_dt: 20260825 }),
        snapshotAttempts: { basDt: 20260818, n: 3 },
      }),
    );
    expect(action).toEqual({ kind: "snapshot", basDt: 20260825 });
  });
});
