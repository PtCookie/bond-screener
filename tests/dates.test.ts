import { describe, expect, test } from "vitest";
import { isKstWeekend, kstWeekday, kstYmd, previousBusinessDayKst } from "@/lib/sync/dates";

describe("kstYmd / kstWeekday", () => {
  test("UTC 자정 직전은 KST로 다음날이 될 수 있다", () => {
    // 2026-08-21 15:30 UTC = 2026-08-22 00:30 KST
    const date = new Date("2026-08-21T15:30:00Z");
    expect(kstYmd(date)).toBe(20260822);
  });

  test("KST 기준 요일을 계산한다 (2026-08-22는 토요일)", () => {
    const date = new Date("2026-08-21T15:30:00Z"); // KST 2026-08-22 00:30, 토요일
    expect(kstWeekday(date)).toBe(6);
  });
});

describe("isKstWeekend", () => {
  test("토/일은 주말", () => {
    expect(isKstWeekend(new Date("2026-08-21T15:30:00Z"))).toBe(true); // KST 토
  });

  test("평일은 주말 아님", () => {
    // 2026-08-19 00:00 UTC = 2026-08-19 09:00 KST, 수요일
    expect(isKstWeekend(new Date("2026-08-19T00:00:00Z"))).toBe(false);
  });
});

describe("previousBusinessDayKst", () => {
  test("월요일의 직전 영업일은 금요일 (주말 건너뜀)", () => {
    // 2026-08-24는 월요일(KST). 09:00 KST = 2026-08-24T00:00:00Z
    const monday = new Date("2026-08-24T00:00:00Z");
    expect(previousBusinessDayKst(monday)).toBe(20260821); // 금요일
  });

  test("화요일의 직전 영업일은 월요일", () => {
    const tuesday = new Date("2026-08-25T00:00:00Z");
    expect(previousBusinessDayKst(tuesday)).toBe(20260824);
  });
});
