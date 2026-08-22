import { describe, expect, test } from "vitest";
import { normDate, normInt, normReal, normText, normYn } from "@/lib/openapi/normalize";

describe("normText", () => {
  test("빈 문자열은 null", () => {
    expect(normText("")).toBeNull();
  });

  test("공백 한 칸은 null (시세 API의 xpYrCnt/itmsCtg 실측 형태)", () => {
    expect(normText(" ")).toBeNull();
  });

  test("여러 공백도 null", () => {
    expect(normText("   ")).toBeNull();
  });

  test("문자열 NULL은 null", () => {
    expect(normText("NULL")).toBeNull();
    expect(normText("null")).toBeNull();
  });

  test("앞뒤 공백은 trim된다", () => {
    expect(normText("  AAA  ")).toBe("AAA");
  });

  test("정상 문자열은 그대로", () => {
    expect(normText("한국전력공사")).toBe("한국전력공사");
  });

  test("number가 와도 문자열로 변환", () => {
    expect(normText(10437)).toBe("10437");
  });

  test("null/undefined는 null", () => {
    expect(normText(null)).toBeNull();
    expect(normText(undefined)).toBeNull();
  });
});

describe("normDate", () => {
  test("YYYYMMDD 8자리는 INTEGER로", () => {
    expect(normDate("20260820")).toBe(20260820);
  });

  test("7자리(형식 오류)는 null", () => {
    expect(normDate("2026082")).toBeNull();
  });

  test("빈 값은 null", () => {
    expect(normDate("")).toBeNull();
  });
});

describe("normInt", () => {
  test("문자열 0은 0 (null이 아님 — 흔한 버그 지점)", () => {
    expect(normInt("0")).toBe(0);
  });

  test("number 0도 0", () => {
    expect(normInt(0)).toBe(0);
  });

  test("문자열 정수", () => {
    expect(normInt("200000000000")).toBe(200000000000);
  });

  test("number 그대로", () => {
    expect(normInt(160000)).toBe(160000);
  });

  test("빈 값은 null", () => {
    expect(normInt("")).toBeNull();
  });
});

describe("normReal", () => {
  test("문자열 0은 0", () => {
    expect(normReal("0")).toBe(0);
  });

  test("소수", () => {
    expect(normReal("3.545")).toBe(3.545);
  });

  test("number 그대로", () => {
    expect(normReal(3.545)).toBe(3.545);
  });

  test("빈 값은 null", () => {
    expect(normReal(" ")).toBeNull();
  });
});

describe("normYn", () => {
  test("Y는 1", () => {
    expect(normYn("Y")).toBe(1);
  });

  test("N은 0", () => {
    expect(normYn("N")).toBe(0);
  });

  test("소문자도 인식", () => {
    expect(normYn("y")).toBe(1);
    expect(normYn("n")).toBe(0);
  });

  test("빈 값은 null", () => {
    expect(normYn("")).toBeNull();
  });

  test("Y/N이 아닌 값은 null", () => {
    expect(normYn("YES")).toBeNull();
  });
});
