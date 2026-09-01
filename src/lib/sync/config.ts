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

/** 기본정보를 전량 재스캔하는 요일(KST 기준, 0=일 ~ 6=토). 수요일로 고정. */
export const ISSU_SYNC_WEEKDAY_KST = 3;

/**
 * 한 tick(cron invocation) 안에서 페이지를 이어 처리할 wall-clock 예산(ms). cron 간격이
 * 1분이라 invocation이 겹쳐 같은 페이지를 중복 처리하지 않도록 간격보다 충분히 짧게 잡는다.
 * CPU 자체는 페이지당 ~12ms(1,000건 실측)라 30초 예산에 비해 무의미한 수준 — 실질 상한은
 * 오픈API 응답 지연(~500ms/페이지)이다.
 */
export const TICK_WALL_BUDGET_MS = 20_000;

/** 위 wall-clock 예산과 별개로 두는 페이지 수 상한 — API가 비정상적으로 빨리 응답해도 한 tick이 무한정 길어지지 않게 한다. */
export const MAX_PAGES_PER_TICK = 40;

/** 스냅샷 빌드가 basDt당 이 횟수만큼 실패하면 `planTick`이 재시도를 멈춘다(무한 재시도 방지). */
export const SNAPSHOT_MAX_ATTEMPTS = 3;
