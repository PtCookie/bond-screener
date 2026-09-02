/**
 * cron 파이프라인 운용 상수.
 *
 * Workers Paid 전환(2026-09) 전에는 Free tier CPU 예산(10ms/invocation)에 맞춰
 * `ISSU_PAGE_SIZE=200`, "한 tick에 페이지 1개만" 규칙으로 운용했다. Paid의 cron CPU
 * 한도는 30초(1시간 미만 간격)라 그 제약이 사실상 사라졌지만, isolate 메모리(128MB)는
 * Free/Paid 공통이라 페이지 크기·tick당 페이지 수는 CPU가 아니라 **메모리와 오픈API
 * 호출 예산**(개발계정 일 10,000건)을 기준으로 다시 잡았다.
 */
export const ISSU_PAGE_SIZE = 1000;

/** 시세는 하루 1페이지(332건, ~1ms)로 충분해 페이지 크기를 크게 잡아도 여유가 크다. */
export const PRICE_PAGE_SIZE = 1000;

/**
 * 기본정보(issu)는 매 영업일 수집한다(2026-09부터 — 예전엔 이 요일에만 전량 재스캔했다).
 * 이 상수는 이제 "**base 스냅샷을 전량 재빌드하는 요일**"이라는 뜻으로 남는다(KST 기준,
 * 0=일 ~ 6=토). base(3MB대)는 `immutable` 캐시라 매일 재빌드하면 방문자가 매일 그 전체를
 * 다시 받게 되므로, 이 요일에만 전량 재빌드하고(compaction) 나머지 평일은
 * `src/lib/snapshot/bond-delta.ts`가 그날 변경분만 담은 작은 델타를 올린다
 * (`src/lib/sync/plan.ts`의 snapshot/bondDelta 분기 참고).
 */
export const SNAPSHOT_REBUILD_WEEKDAY_KST = 3;

/**
 * 한 tick(cron invocation) 안에서 페이지를 이어 처리할 wall-clock 예산(ms). cron 간격이
 * 1분이라 invocation이 겹쳐 같은 페이지를 중복 처리하지 않도록 간격보다 충분히 짧게 잡는다.
 * CPU 자체는 페이지당 ~12ms(1,000건 실측)라 30초 예산에 비해 무의미한 수준 — 실질 상한은
 * 오픈API 응답 지연(~500ms/페이지)이다.
 */
export const TICK_WALL_BUDGET_MS = 20_000;

/** 위 wall-clock 예산과 별개로 두는 페이지 수 상한 — API가 비정상적으로 빨리 응답해도 한 tick이 무한정 길어지지 않게 한다. */
export const MAX_PAGES_PER_TICK = 40;

/** 스냅샷/bond 델타 빌드가 basDt당 이 횟수만큼 실패하면 `planTick`이 재시도를 멈춘다(무한 재시도 방지). */
export const SNAPSHOT_MAX_ATTEMPTS = 3;

/**
 * `status='empty'`(0건 조회, 오픈API 데이터 미발행 추정)로 끝난 run을 다시 시작하기까지
 * 기다리는 시간(ms). 백오프가 없으면 1분 간격 cron(`wrangler.jsonc`의 `triggers.crons`)이
 * 매분 같은 미발행 basDt를 재조회한다 — 특히 issu를 매일 돌리면서 관측된 문제(원격 `sync_run`에 `price attempt=601`
 * 실측, 주말 내내 empty였던 basDt를 5시간 창 동안 매분 재시도한 흔적). `planTick`이
 * `finished_at`(없으면 `updated_at`)로부터 이 시간이 지났는지만 보고, 새 컬럼 없이
 * 기존 필드로 판단한다.
 */
export const EMPTY_RETRY_BACKOFF_MS = 15 * 60_000;

/**
 * 하루 변경 bond 행 수가 이 값 이상이면 `buildAndPutBondDelta`가 델타 대신 전량 재빌드로
 * 폴백한다(`{ tooLarge: true }`) — 델타가 base에 근접한 크기로 불어나면 base+delta 구조의
 * 이점(작은 일간 페이로드)이 사라지므로, 그 지점부터는 차라리 base를 다시 굳히는 편이 낫다.
 * 정상 운영 실측(9/1 주간 스캔 462행/주)에 비해 넉넉한 상한이다.
 */
export const BOND_DELTA_MAX_ROWS = 5000;
