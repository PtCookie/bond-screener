import { describe, expect, test } from "vitest";
import { fingerprintRow } from "@/lib/bond/fingerprint";

describe("fingerprintRow", () => {
  test("동일 입력은 동일 지문", () => {
    const a = fingerprintRow(["KR350101G843", "한국전력공사", 2.19, null]);
    const b = fingerprintRow(["KR350101G843", "한국전력공사", 2.19, null]);
    expect(a).toBe(b);
  });

  test("한 필드만 달라도 지문이 달라진다", () => {
    const a = fingerprintRow(["KR350101G843", "한국전력공사", 2.19, null]);
    const b = fingerprintRow(["KR350101G843", "한국전력공사", 2.2, null]);
    expect(a).not.toBe(b);
  });

  test("구분자 없이 이어붙이면 충돌하는 케이스가 구분된다", () => {
    // 구분자가 없으면 ["ab","c"]와 ["a","bc"]가 둘 다 "abc"로 이어져 충돌한다.
    const a = fingerprintRow(["ab", "c"]);
    const b = fingerprintRow(["a", "bc"]);
    expect(a).not.toBe(b);
  });

  test("null과 빈 문자열은 구분된다", () => {
    const a = fingerprintRow([null, "x"]);
    const b = fingerprintRow(["", "x"]);
    expect(a).not.toBe(b);
  });

  test("53비트 안전정수를 반환한다 (SQLite INTEGER 저장 가능)", () => {
    const fp = fingerprintRow(["임의의 값", 12345, null, "another"]);
    expect(Number.isSafeInteger(fp)).toBe(true);
  });
});
