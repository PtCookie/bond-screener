import { describe, expect, test } from "vitest";
import type { SyncRun } from "@/lib/d1/sync-run-repo";
import { EMPTY_RETRY_BACKOFF_MS } from "@/lib/sync/config";
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

/** 스냅샷/델타 관련 필드의 기본값(미빌드·미실패)을 채운 뒤 오버라이드를 적용한다. */
function input(overrides: Partial<PlanTickInput> & Pick<PlanTickInput, "now">): PlanTickInput {
  return {
    runningRun: null,
    priceRunToday: null,
    issuRunToday: null,
    snapshotBasDt: null,
    snapshotAttempts: null,
    bondDeltaBasDt: null,
    bondDeltaAttempts: null,
    ...overrides,
  };
}

// 2026-08-24T01:00:00Z = KST 2026-08-24 10:00, 월요일(base 재빌드 요일 아님).
const MONDAY = new Date("2026-08-24T01:00:00Z");
// 2026-08-26T01:00:00Z = KST 2026-08-26 10:00, 수요일(SNAPSHOT_REBUILD_WEEKDAY_KST).
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

  test("시세가 끝났고 기본정보가 아직 시작 전이면 요일 무관 기본정보 시작", () => {
    // 2026-09부터 기본정보도 시세와 동일하게 매 영업일 수집한다 — "기본정보 요일"
    // 게이트가 사라져 월요일에도 시작해야 한다.
    const action = planTick(input({ now: MONDAY, priceRunToday: run({ status: "done" }) }));
    expect(action.kind).toBe("start");
    expect(action.kind === "start" && action.source).toBe("issu");
  });

  test("기본정보가 오늘 이미 시작됐고(running) 스냅샷/델타 대상이 아니면 idle", () => {
    const action = planTick(
      input({
        now: MONDAY,
        priceRunToday: run({ status: "done", bas_dt: 20260825 }),
        issuRunToday: run({ source: "issu", status: "running", bas_dt: 20260825 }),
      }),
    );
    expect(action).toEqual({ kind: "idle" });
  });

  test("시세가 실패했어도(오늘 abort) 요일 무관 기본정보는 진행한다", () => {
    const action = planTick(input({ now: MONDAY, priceRunToday: run({ status: "failed", bas_dt: 20260825 }) }));
    expect(action.kind).toBe("start");
    expect(action.kind === "start" && action.source).toBe("issu");
  });

  test("시세가 empty(0건)로 끝났어도 백오프 시간이 안 지났으면 재시도하지 않는다", () => {
    // 실운영에서 실제로 발생한 문제: 백오프 없이 empty를 null과 동일하게 취급하면 cron이
    // 매분 미발행 basDt를 헛되이 재조회한다(원격 sync_run에 price attempt=601 실측).
    const finishedAt = MONDAY.getTime() - 5 * 60_000; // 5분 전
    const action = planTick(
      input({
        now: MONDAY,
        priceRunToday: run({ status: "empty", total_count: 0, finished_at: finishedAt }),
        // price가 재시도를 안 해도 issu가 대신 시작되지 않도록 이미 진행 중으로 막는다.
        issuRunToday: run({ source: "issu", status: "running" }),
      }),
    );
    expect(action).toEqual({ kind: "idle" });
  });

  test("시세가 empty로 끝났고 백오프 시간이 지났으면 재시도한다", () => {
    const finishedAt = MONDAY.getTime() - (EMPTY_RETRY_BACKOFF_MS + 60_000); // 백오프 + 1분 전
    const action = planTick(
      input({ now: MONDAY, priceRunToday: run({ status: "empty", total_count: 0, finished_at: finishedAt }) }),
    );
    expect(action.kind).toBe("start");
    expect(action.kind === "start" && action.source).toBe("price");
  });

  test("기본정보가 empty로 끝났어도 백오프 시간이 안 지났으면 재시도하지 않는다", () => {
    const finishedAt = MONDAY.getTime() - 5 * 60_000;
    const action = planTick(
      input({
        now: MONDAY,
        priceRunToday: run({ status: "done", bas_dt: 20260825 }),
        issuRunToday: run({
          source: "issu",
          status: "empty",
          bas_dt: 20260825,
          total_count: 0,
          finished_at: finishedAt,
        }),
      }),
    );
    expect(action).toEqual({ kind: "idle" });
  });

  test("기본정보가 empty로 끝났고 백오프 시간이 지나면 재시도한다", () => {
    const finishedAt = MONDAY.getTime() - (EMPTY_RETRY_BACKOFF_MS + 60_000);
    const action = planTick(
      input({
        now: MONDAY,
        priceRunToday: run({ status: "done", bas_dt: 20260825 }),
        issuRunToday: run({
          source: "issu",
          status: "empty",
          bas_dt: 20260825,
          total_count: 0,
          finished_at: finishedAt,
        }),
      }),
    );
    expect(action.kind).toBe("start");
    expect(action.kind === "start" && action.source).toBe("issu");
  });

  test("base가 아예 없으면(snapshotBasDt=null) 요일 무관 전량 재빌드", () => {
    const action = planTick(
      input({
        now: MONDAY,
        priceRunToday: run({ status: "done", bas_dt: 20260825 }),
        issuRunToday: run({ source: "issu", status: "done", bas_dt: 20260825 }),
      }),
    );
    expect(action).toEqual({ kind: "snapshot", basDt: 20260825 });
  });

  test("base가 이미 있고 오늘이 재빌드 요일이 아니면 bondDelta", () => {
    const action = planTick(
      input({
        now: MONDAY,
        priceRunToday: run({ status: "done", bas_dt: 20260825 }),
        issuRunToday: run({ source: "issu", status: "done", bas_dt: 20260825 }),
        snapshotBasDt: 20260818, // 지난주 재빌드분 — 오늘자(20260825)와는 다름
      }),
    );
    expect(action).toEqual({ kind: "bondDelta", basDt: 20260825 });
  });

  test("base가 이미 있고 오늘이 재빌드 요일이면 전량 재빌드", () => {
    const action = planTick(
      input({
        now: WEDNESDAY,
        priceRunToday: run({ status: "done", bas_dt: 20260825 }),
        issuRunToday: run({ source: "issu", status: "done", bas_dt: 20260825 }),
        snapshotBasDt: 20260818,
      }),
    );
    expect(action).toEqual({ kind: "snapshot", basDt: 20260825 });
  });

  test("base가 오늘자로 이미 최신이면 bondDelta도 만들지 않고 idle", () => {
    const action = planTick(
      input({
        now: WEDNESDAY,
        priceRunToday: run({ status: "done", bas_dt: 20260825 }),
        issuRunToday: run({ source: "issu", status: "done", bas_dt: 20260825 }),
        snapshotBasDt: 20260825,
      }),
    );
    expect(action).toEqual({ kind: "idle" });
  });

  test("bondDelta가 이미 오늘자로 최신이면 idle", () => {
    const action = planTick(
      input({
        now: MONDAY,
        priceRunToday: run({ status: "done", bas_dt: 20260825 }),
        issuRunToday: run({ source: "issu", status: "done", bas_dt: 20260825 }),
        snapshotBasDt: 20260818,
        bondDeltaBasDt: 20260825,
      }),
    );
    expect(action).toEqual({ kind: "idle" });
  });

  test("재빌드 실패가 SNAPSHOT_MAX_ATTEMPTS 미만이면 재시도한다", () => {
    const action = planTick(
      input({
        now: WEDNESDAY,
        priceRunToday: run({ status: "done", bas_dt: 20260825 }),
        issuRunToday: run({ source: "issu", status: "done", bas_dt: 20260825 }),
        snapshotAttempts: { basDt: 20260825, n: 2 },
      }),
    );
    expect(action).toEqual({ kind: "snapshot", basDt: 20260825 });
  });

  test("재빌드 실패가 SNAPSHOT_MAX_ATTEMPTS에 도달하면 포기하고 bondDelta로 폴백한다", () => {
    // base 재빌드는 포기해도 그날 변경분을 델타로라도 반영해 최신을 유지한다.
    const action = planTick(
      input({
        now: WEDNESDAY,
        priceRunToday: run({ status: "done", bas_dt: 20260825 }),
        issuRunToday: run({ source: "issu", status: "done", bas_dt: 20260825 }),
        snapshotAttempts: { basDt: 20260825, n: 3 },
      }),
    );
    expect(action).toEqual({ kind: "bondDelta", basDt: 20260825 });
  });

  test("bondDelta 실패가 SNAPSHOT_MAX_ATTEMPTS에 도달하면 포기하고 idle", () => {
    const action = planTick(
      input({
        now: MONDAY,
        priceRunToday: run({ status: "done", bas_dt: 20260825 }),
        issuRunToday: run({ source: "issu", status: "done", bas_dt: 20260825 }),
        snapshotBasDt: 20260818,
        bondDeltaAttempts: { basDt: 20260825, n: 3 },
      }),
    );
    expect(action).toEqual({ kind: "idle" });
  });

  test("다른 basDt의 실패 이력은 이번 basDt 재시도 판단에 영향을 주지 않는다", () => {
    const action = planTick(
      input({
        now: WEDNESDAY,
        priceRunToday: run({ status: "done", bas_dt: 20260825 }),
        issuRunToday: run({ source: "issu", status: "done", bas_dt: 20260825 }),
        snapshotAttempts: { basDt: 20260818, n: 3 },
      }),
    );
    expect(action).toEqual({ kind: "snapshot", basDt: 20260825 });
  });
});
