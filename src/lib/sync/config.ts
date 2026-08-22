/**
 * cron 파이프라인 운용 상수. CPU 실측(1,000건 11.7ms, 250건 5.0ms, Free tier 예산 10ms)에
 * 근거해 `ISSU_PAGE_SIZE`를 잡았다. 배포 후 Observability 로그의 실측 CPU로 조정할 것 —
 * 8ms를 넘으면 낮추고, 여유가 크면 높여 페이지 수(및 전체 갱신 소요 시간)를 줄인다.
 */
export const ISSU_PAGE_SIZE = 200;

/** 시세는 하루 1페이지(332건, ~1ms)로 충분해 페이지 크기를 크게 잡아도 CPU 여유가 크다. */
export const PRICE_PAGE_SIZE = 1000;

/** 기본정보를 전량 재스캔하는 요일(KST 기준, 0=일 ~ 6=토). 수요일로 고정. */
export const ISSU_SYNC_WEEKDAY_KST = 3;
