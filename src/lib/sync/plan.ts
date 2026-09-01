/**
 * "이번 tick에 뭘 할지" 결정하는 순수 함수. 시각과 `sync_run`/`app_meta` 조회 결과만으로
 * 판단하므로 D1/네트워크 없이 단위 테스트가 가능하다.
 *
 * 우선순위: 진행 중인 run이 있으면 무조건 이어서 처리 → 시세(짧음, 매 영업일)를 항상
 * 기본정보(김, 주 1회)보다 먼저 → 기본정보는 지정 요일에만 → 기본정보가 그 주에 끝났고
 * 아직 스냅샷을 안 만들었으면 스냅샷.
 */
import type { SyncRun, SyncSource } from "@/lib/d1/sync-run-repo";
import { ISSU_SYNC_WEEKDAY_KST, SNAPSHOT_MAX_ATTEMPTS } from "./config";
import { kstWeekday, previousBusinessDayKst } from "./dates";

export type SyncAction =
  | { kind: "resume"; source: SyncSource; basDt: number }
  | { kind: "start"; source: SyncSource; basDt: number }
  | { kind: "snapshot"; basDt: number }
  | { kind: "idle" };

export interface PlanTickInput {
  now: Date;
  /** `status='running'`인 run(있다면 source 무관 단 하나) — 있으면 최우선으로 이어서 처리. */
  runningRun: SyncRun | null;
  /** 오늘 대상 basDt의 시세 run(없으면 아직 시작 전). */
  priceRunToday: SyncRun | null;
  /** 이번 주 대상 basDt의 기본정보 run(없으면 아직 시작 전). */
  issuRunThisWeek: SyncRun | null;
  /** `app_meta`에 기록된, 마지막으로 성공한 스냅샷 빌드의 basDt. 없으면 `null`. */
  snapshotBasDt: number | null;
  /** 현재 대상 basDt에 대한 스냅샷 빌드 실패 누적(`app_meta`). 없으면 `null`(=0회). */
  snapshotAttempts: { basDt: number; n: number } | null;
}

export function planTick(input: PlanTickInput): SyncAction {
  const { now, runningRun, priceRunToday, issuRunThisWeek, snapshotBasDt, snapshotAttempts } = input;

  if (runningRun) {
    return { kind: "resume", source: runningRun.source, basDt: runningRun.bas_dt };
  }

  const priceBasDt = previousBusinessDayKst(now);
  // `empty`는 조회 결과 0건으로 끝난 것 — 오픈API 데이터가 아직 발행 안 됐을 뿐일 수 있어
  // (영업일+1일 오후 1시 이후 반영) `null`(미시작)과 똑같이 재시도 대상으로 본다.
  // 그렇지 않으면 데이터가 실제로 나온 뒤에도 그 basDt를 영영 다시 조회하지 않는다.
  if (priceRunToday === null || priceRunToday.status === "empty") {
    return { kind: "start", source: "price", basDt: priceBasDt };
  }
  if (priceRunToday.status === "failed") {
    // 오늘치 시세는 실패 처리됨 — 같은 tick에서 재시도하지 않고(abort-today 정책과 일관)
    // 기본정보 진행 여부만 확인한다.
  }

  const isIssuDay = kstWeekday(now) === ISSU_SYNC_WEEKDAY_KST;
  if (isIssuDay && (issuRunThisWeek === null || issuRunThisWeek.status === "empty")) {
    return { kind: "start", source: "issu", basDt: priceBasDt };
  }

  // 기본정보가 이번 주 대상 basDt에 대해 이미 끝났고(done), 그 basDt로 아직 스냅샷을
  // 만들지 않았으면 다음 tick에서 스냅샷을 빌드한다 — 기본정보 반영(D1) → 스냅샷 발행(R2)
  // 순서가 이 조건으로 구조적으로 보장된다. 실패가 SNAPSHOT_MAX_ATTEMPTS를 넘으면 포기하고
  // idle로 빠진다(무한 재시도 방지) — 다음 주 기본정보 갱신 때 다시 시도된다.
  if (issuRunThisWeek?.status === "done" && snapshotBasDt !== issuRunThisWeek.bas_dt) {
    const attempts = snapshotAttempts?.basDt === issuRunThisWeek.bas_dt ? snapshotAttempts.n : 0;
    if (attempts < SNAPSHOT_MAX_ATTEMPTS) {
      return { kind: "snapshot", basDt: issuRunThisWeek.bas_dt };
    }
  }

  return { kind: "idle" };
}
