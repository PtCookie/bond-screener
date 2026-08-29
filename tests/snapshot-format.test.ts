import { describe, expect, test } from "vitest";
import { epochDayToYmd, ymdToEpochDay } from "@/lib/snapshot/format";

/** non-null assertion 없이 "null이면 테스트 실패"를 표현하기 위한 래퍼. */
function epochDay(ymd: number): number {
  const v = ymdToEpochDay(ymd);
  if (v === null) throw new Error(`ymdToEpochDay(${ymd})가 null을 반환함`);
  return v;
}

describe("ymdToEpochDay / epochDayToYmd", () => {
  test("null은 null로 왕복한다", () => {
    expect(ymdToEpochDay(null)).toBeNull();
    expect(epochDayToYmd(null)).toBeNull();
  });

  test("1970-01-01은 epoch day 0", () => {
    expect(ymdToEpochDay(19700101)).toBe(0);
    expect(epochDayToYmd(0)).toBe(19700101);
  });

  test("임의 날짜가 왕복한다", () => {
    for (const ymd of [20260828, 20200102, 19991231, 20000229, 20560603]) {
      expect(epochDayToYmd(ymdToEpochDay(ymd))).toBe(ymd);
    }
  });

  test("윤년 2월 29일을 올바르게 처리한다", () => {
    // 2000년은 400으로 나누어떨어져 윤년, 2100년은 아님(테스트 범위 밖이라 2000년만 확인)
    expect(epochDayToYmd(ymdToEpochDay(20000229))).toBe(20000229);
  });

  test("날짜가 하루 늘면 epoch day도 정확히 1 늘어난다(타임존 영향 없음)", () => {
    expect(epochDay(20260301) - epochDay(20260228)).toBe(1); // 2026은 평년(2월 28일까지)
    expect(epochDay(20260102) - epochDay(20260101)).toBe(1);
  });
});
