/**
 * `src/lib/bond/fingerprint.ts` ↔ `scripts/lib/fingerprint.mjs` 교차검증.
 *
 * AGENTS.md가 명시적으로 경고하는 지점: 둘이 다른 지문을 내면 백필로 적재한 지문과
 * cron이 이후 계산하는 지문이 어긋나 전 종목이 "변경됨"으로 오판된다. "고치면 반드시
 * 교차 검증할 것"이라는 문서상 규칙을 이 파일이 자동화한다.
 */
import { describe, expect, test } from "vitest";
import { fingerprintRow as fingerprintRowTs } from "@/lib/bond/fingerprint";
// scripts/lib/*.mjs는 @/ 별칭을 쓰지 않으므로(AGENTS.md) 상대 경로로 직접 import한다.
import { fingerprintRow as fingerprintRowJs } from "../../scripts/lib/fingerprint.mjs";

const CASES: (string | number | null)[][] = [
  [],
  ["a"],
  [null],
  ["", null, "NULL"],
  ["ab", "c"],
  ["a", "bc"], // 구분자 경계 — 위와 다른 지문이어야 함(별도로 검증)
  [1, 2, 3],
  ["1", "2", "3"], // 숫자 vs 숫자 문자열 — String(1) === "1"이라 위와 같은 지문이어야 함
  [0, -0, -1, 1.5],
  ["테스트채권", "발행사", null, "KR6000011D36"],
  ["🇰🇷유니코드", "emoji😀", null],
  [Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER],
  Array.from({ length: 47 }, (_, i) => (i % 3 === 0 ? null : `field${i}`)), // BOND_COLUMNS 규모 근사
];

describe("fingerprintRow 교차검증 (TS ↔ JS)", () => {
  test.each(CASES.map((c, i) => [i, c] as const))("케이스 %i: 동일 입력 → 동일 지문", (_, values) => {
    expect(fingerprintRowJs(values)).toBe(fingerprintRowTs(values));
  });

  test("구분자가 없으면 충돌할 두 입력이 실제로는 다른 지문을 낸다(양쪽 다)", () => {
    const a = ["ab", "c"];
    const b = ["a", "bc"];
    expect(fingerprintRowTs(a)).not.toBe(fingerprintRowTs(b));
    expect(fingerprintRowJs(a)).not.toBe(fingerprintRowJs(b));
  });

  test("null과 빈 문자열은 서로 다른 지문을 낸다(양쪽 다)", () => {
    expect(fingerprintRowTs([null])).not.toBe(fingerprintRowTs([""]));
    expect(fingerprintRowJs([null])).not.toBe(fingerprintRowJs([""]));
  });

  test("두 구현 모두 53비트 안전정수를 반환한다", () => {
    for (const values of CASES) {
      expect(Number.isSafeInteger(fingerprintRowTs(values))).toBe(true);
      expect(Number.isSafeInteger(fingerprintRowJs(values))).toBe(true);
    }
  });
});
