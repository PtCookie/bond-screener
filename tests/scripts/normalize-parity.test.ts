/**
 * `src/lib/openapi/normalize.ts` ↔ `scripts/lib/normalize.mjs` 교차검증.
 *
 * 두 구현은 구조가 다르다 — TS는 `typeof value === "number"`일 때 직행 경로로 범위를
 * 검사하고(`console.warn` 부작용 포함), JS는 항상 `normText`를 거쳐 문자열로 왕복한다.
 * 유효한 값은 두 경로가 같은 결과에 수렴하지만(문자열 왕복이 손실 없음), `console.warn`
 * 부작용 차이는 이 테스트의 관심사가 아니므로 스파이로 눌러 둔다.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { normDate, normInt, normReal, normText, normYn } from "@/lib/openapi/normalize";
import {
  normDate as normDateJs,
  normInt as normIntJs,
  normReal as normRealJs,
  normText as normTextJs,
  normYn as normYnJs,
} from "../../scripts/lib/normalize.mjs";

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

const TEXT_CASES = [null, undefined, "", " ", "  ", "NULL", "null", "Null", "abc", "  trim me  ", "0", 0, "테스트"];

describe("normText 교차검증", () => {
  test.each(TEXT_CASES.map((c, i) => [i, c] as const))("케이스 %i: %j", (_, value) => {
    expect(normTextJs(value)).toBe(normText(value as never));
  });
});

const DATE_CASES = [null, "", "20260828", "2026-08-28", "1234567", "123456789", "20261301", 20260828];

describe("normDate 교차검증", () => {
  test.each(DATE_CASES.map((c, i) => [i, c] as const))("케이스 %i: %j", (_, value) => {
    expect(normDateJs(value)).toBe(normDate(value as never));
  });
});

const INT_CASES: unknown[] = [
  null,
  "",
  "123",
  "123.5",
  "abc",
  0,
  123,
  123.5,
  -123,
  Number.MAX_SAFE_INTEGER,
  Number.MAX_SAFE_INTEGER + 1,
  NaN,
  Infinity,
  -Infinity,
  String(Number.MAX_SAFE_INTEGER),
];

describe("normInt 교차검증", () => {
  test.each(INT_CASES.map((c, i) => [i, c] as const))("케이스 %i: %j", (_, value) => {
    expect(normIntJs(value)).toBe(normInt(value as never));
  });
});

const REAL_CASES: unknown[] = [null, "", "3.5", "3.500", "abc", 0, 3.5, -3.5, NaN, Infinity, -Infinity, "1e10", 1e10];

describe("normReal 교차검증", () => {
  test.each(REAL_CASES.map((c, i) => [i, c] as const))("케이스 %i: %j", (_, value) => {
    expect(normRealJs(value)).toBe(normReal(value as never));
  });
});

const YN_CASES = [null, "", "Y", "y", "N", "n", "yes", "1", "0", " Y "];

describe("normYn 교차검증", () => {
  test.each(YN_CASES.map((c, i) => [i, c] as const))("케이스 %i: %j", (_, value) => {
    expect(normYnJs(value)).toBe(normYn(value as never));
  });
});
