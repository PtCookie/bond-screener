import { describe, expect, test } from "vitest";
import { DASH, compareGrade, deltaTone, fmtAmount, fmtDelta, fmtPrice, fmtRate, fmtYmd } from "@/lib/screener/format";

describe("fmtYmd", () => {
  test("YYYYMMDD 정수를 하이픈 포맷으로 변환한다", () => {
    expect(fmtYmd(20260822)).toBe("2026-08-22");
  });

  test("연도 경계값", () => {
    expect(fmtYmd(20260101)).toBe("2026-01-01");
    expect(fmtYmd(20261231)).toBe("2026-12-31");
  });

  test("null은 대시", () => {
    expect(fmtYmd(null)).toBe(DASH);
  });
});

describe("fmtRate", () => {
  test("0은 유효값으로 표시한다 (null과 구분)", () => {
    expect(fmtRate(0)).toBe("0.000%");
  });

  test("null은 대시", () => {
    expect(fmtRate(null)).toBe(DASH);
  });

  test("소수점 자리수 기본값 3", () => {
    expect(fmtRate(2.054)).toBe("2.054%");
  });
});

describe("fmtAmount", () => {
  test("1조 이상은 조 단위", () => {
    expect(fmtAmount(1e12)).toBe("1.0조");
  });

  test("1조 미만 999,999,999,999는 억 단위 (반올림 + 콤마)", () => {
    expect(fmtAmount(999_999_999_999)).toBe("10,000억");
  });

  test("1억 경계", () => {
    expect(fmtAmount(1e8)).toBe("1억");
  });

  test("1억 미만은 콤마 표기", () => {
    expect(fmtAmount(99_999_999)).toBe("99,999,999");
  });

  test("null은 대시", () => {
    expect(fmtAmount(null)).toBe(DASH);
  });
});

describe("fmtPrice", () => {
  test("천단위 콤마", () => {
    expect(fmtPrice(8283)).toBe("8,283");
  });

  test("null은 대시", () => {
    expect(fmtPrice(null)).toBe(DASH);
  });
});

describe("fmtDelta / deltaTone", () => {
  test("0은 부호 없이 표시하고 보합으로 분류한다", () => {
    expect(fmtDelta(0)).toBe("0");
    expect(deltaTone(0)).toBe("flat");
  });

  test("양수는 + 부호", () => {
    expect(fmtDelta(58)).toBe("+58");
    expect(deltaTone(58)).toBe("up");
  });

  test("음수는 - 부호", () => {
    expect(fmtDelta(-12)).toBe("-12");
    expect(deltaTone(-12)).toBe("down");
  });

  test("null은 대시 / none", () => {
    expect(fmtDelta(null)).toBe(DASH);
    expect(deltaTone(null)).toBe("none");
  });
});

describe("compareGrade", () => {
  test("AAA가 AA+보다 먼저 온다", () => {
    expect(compareGrade("AAA", "AA+")).toBeLessThan(0);
  });

  test("AA+가 A+보다 먼저 온다", () => {
    expect(compareGrade("AA+", "A+")).toBeLessThan(0);
  });

  test("A+가 BBB보다 먼저 온다", () => {
    expect(compareGrade("A+", "BBB")).toBeLessThan(0);
  });

  test("null은 항상 뒤로 정렬된다", () => {
    expect(compareGrade("BBB-", null)).toBeLessThan(0);
    expect(compareGrade(null, "BBB-")).toBeGreaterThan(0);
    expect(compareGrade(null, null)).toBe(0);
  });
});
