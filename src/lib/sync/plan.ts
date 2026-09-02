/**
 * "이번 tick에 뭘 할지" 결정하는 순수 함수. 시각과 `sync_run`/`app_meta` 조회 결과만으로
 * 판단하므로 D1/네트워크 없이 단위 테스트가 가능하다.
 *
 * 우선순위: 진행 중인 run이 있으면 무조건 이어서 처리 → 시세(짧음)를 항상 기본정보보다
 * 먼저(둘 다 이제 매 영업일 수집) → 기본정보가 오늘 대상 basDt로 끝났으면, base 재빌드
 * 요일(또는 base가 아예 없으면)엔 전량 재빌드(snapshot), 그 외 평일엔 그날 변경분만 담은
 * bond 델타(bondDelta) — base(3MB대, immutable 캐시)를 매일 무효화하지 않기 위한
 * base+delta 구조다(`src/lib/snapshot/bond-delta.ts` 참고).
 */
import type { SyncRun, SyncSource } from "@/lib/d1/sync-run-repo";
import { EMPTY_RETRY_BACKOFF_MS, SNAPSHOT_MAX_ATTEMPTS, SNAPSHOT_REBUILD_WEEKDAY_KST } from "./config";
import { kstWeekday, previousBusinessDayKst } from "./dates";

export type SyncAction =
  | { kind: "resume"; source: SyncSource; basDt: number }
  | { kind: "start"; source: SyncSource; basDt: number }
  | { kind: "snapshot"; basDt: number }
  | { kind: "bondDelta"; basDt: number }
  | { kind: "idle" };

export interface AttemptCounter {
  basDt: number;
  n: number;
}

export interface PlanTickInput {
  now: Date;
  /** `status='running'`인 run(있다면 source 무관 단 하나) — 있으면 최우선으로 이어서 처리. */
  runningRun: SyncRun | null;
  /** 오늘 대상 basDt의 시세 run(없으면 아직 시작 전). */
  priceRunToday: SyncRun | null;
  /** 오늘 대상 basDt의 기본정보 run(없으면 아직 시작 전). 2026-09부터 매 영업일 수집한다. */
  issuRunToday: SyncRun | null;
  /** `app_meta`에 기록된, 마지막으로 성공한 base 스냅샷 재빌드의 basDt. 없으면 `null`. */
  snapshotBasDt: number | null;
  /** 현재 대상 basDt에 대한 base 재빌드 실패 누적(`app_meta`). 없으면 `null`(=0회). */
  snapshotAttempts: AttemptCounter | null;
  /** `app_meta`에 기록된, 마지막으로 성공한 bond 델타의 basDt. 없으면 `null`. */
  bondDeltaBasDt: number | null;
  /** 현재 대상 basDt에 대한 bond 델타 실패 누적(`app_meta`). 없으면 `null`(=0회). */
  bondDeltaAttempts: AttemptCounter | null;
}

/**
 * `run`을 이번 tick에 (재)시작해야 하면 `true`. `running`은 `planTick`이 최상단에서 이미
 * 가로채므로 여기서 다루지 않는다. `failed`는 abort-today 정책상 같은 tick에서 재시도하지
 * 않는다 — 다음 tick(사실상 다음 영업일)에 `startSyncRun`이 재시작한다.
 *
 * `empty`(0건 조회, 오픈API 데이터 미발행 추정)는 `EMPTY_RETRY_BACKOFF_MS`가 지나야
 * 재시작 대상으로 본다 — 백오프가 없으면 1분 간격 cron(`wrangler.jsonc`의 `triggers.crons`)이
 * 매분 같은 미발행 basDt를 헛되이 재조회한다(원격 `sync_run`에 `price attempt=601` 실측).
 */
function shouldStart(run: SyncRun | null, now: Date): boolean {
  if (run === null) return true;
  if (run.status !== "empty") return false;
  const since = now.getTime() - (run.finished_at ?? run.updated_at);
  return since >= EMPTY_RETRY_BACKOFF_MS;
}

function attemptsFor(counter: AttemptCounter | null, basDt: number): number {
  return counter?.basDt === basDt ? counter.n : 0;
}

export function planTick(input: PlanTickInput): SyncAction {
  const {
    now,
    runningRun,
    priceRunToday,
    issuRunToday,
    snapshotBasDt,
    snapshotAttempts,
    bondDeltaBasDt,
    bondDeltaAttempts,
  } = input;

  if (runningRun) {
    return { kind: "resume", source: runningRun.source, basDt: runningRun.bas_dt };
  }

  const targetBasDt = previousBusinessDayKst(now);

  if (shouldStart(priceRunToday, now)) {
    return { kind: "start", source: "price", basDt: targetBasDt };
  }

  if (shouldStart(issuRunToday, now)) {
    return { kind: "start", source: "issu", basDt: targetBasDt };
  }

  if (issuRunToday?.status === "done") {
    const basDt = issuRunToday.bas_dt;
    // base가 아직 한 번도 없으면 요일 무관 최초 1회는 반드시 전량 재빌드한다(델타를 병합할
    // base 자체가 없어서다).
    const needsRebuild = snapshotBasDt === null || kstWeekday(now) === SNAPSHOT_REBUILD_WEEKDAY_KST;

    if (needsRebuild && snapshotBasDt !== basDt && attemptsFor(snapshotAttempts, basDt) < SNAPSHOT_MAX_ATTEMPTS) {
      return { kind: "snapshot", basDt };
    }

    // base가 이미 오늘자로 최신이면(방금 재빌드했거나 애초에 재빌드 요일이 아니었지만
    // snapshotBasDt가 우연히 같음) 델타를 따로 만들 필요가 없다. base 재빌드가
    // SNAPSHOT_MAX_ATTEMPTS를 소진해 포기한 경우에도 이 분기로 떨어져 델타로라도
    // 최신을 유지한다.
    if (
      snapshotBasDt !== basDt &&
      bondDeltaBasDt !== basDt &&
      attemptsFor(bondDeltaAttempts, basDt) < SNAPSHOT_MAX_ATTEMPTS
    ) {
      return { kind: "bondDelta", basDt };
    }
  }

  return { kind: "idle" };
}
