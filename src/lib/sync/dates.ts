/**
 * KST 기준 날짜 계산. 순수 함수.
 *
 * 공휴일 캘린더는 반영하지 않는다(주말만 제외) — 설날·추석 등 최대 9일 연휴에는 대상
 * 영업일에 실제로는 데이터가 없어 `sync_run`이 0건으로 끝나고 다음날 재시도하게 된다.
 * 이는 무해하지만(idempotent), 향후 공휴일 API 연동으로 정확도를 높일 수 있다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function toKst(date: Date): Date {
  return new Date(date.getTime() + KST_OFFSET_MS);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toYmd(date: Date): number {
  return Number(`${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}`);
}

/** UTC 기준 `Date`를 KST 기준 YYYYMMDD 정수로. */
export function kstYmd(date: Date): number {
  return toYmd(toKst(date));
}

/** KST 기준 요일(0=일 ~ 6=토). */
export function kstWeekday(date: Date): number {
  return toKst(date).getUTCDay();
}

/** 주말이면 true (KST 기준). */
export function isKstWeekend(date: Date): boolean {
  const day = kstWeekday(date);
  return day === 0 || day === 6;
}

/**
 * `date` 기준 직전 영업일(주말 제외)의 KST YYYYMMDD. 데이터 갱신이 "영업일+1일 오후 1시
 * 이후" 반영이므로, cron이 도는 시각(오늘)에는 어제 영업일자를 조회 대상으로 삼는다.
 */
export function previousBusinessDayKst(date: Date): number {
  const kst = toKst(date);
  const cursor = new Date(kst);
  do {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  } while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6);
  return toYmd(cursor);
}
