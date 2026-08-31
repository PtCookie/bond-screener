/**
 * `scripts/lib/sql-gen.mjs`의 `buildMultiValuesInsert` — 백필 전용 다중 VALUES INSERT
 * 생성기. 다른 scripts/lib 파일과 달리 `src/`에 대응하는 TS 구현이 없다(고유 로직) —
 * D1 `wrangler d1 execute --file`의 "Maximum SQL statement length: 100,000 bytes" 제한을
 * **행 개수가 아니라 바이트 크기**로 우회하는 것이 핵심이라 그 청킹 경계를 직접 검증한다.
 */
import { describe, expect, test } from "vitest";
import { buildMultiValuesInsert } from "../../scripts/lib/sql-gen.mjs";

describe("buildMultiValuesInsert", () => {
  test("기본 형태 — INSERT INTO ... VALUES ... ON CONFLICT DO NOTHING;", () => {
    const sql = buildMultiValuesInsert("bond", ["isin_cd", "bond_bal"], [["KR001", 1000]]);
    expect(sql).toBe("INSERT INTO bond (isin_cd, bond_bal)\nVALUES\n  ('KR001', 1000)\nON CONFLICT DO NOTHING;");
  });

  test("null/undefined는 SQL NULL 리터럴로, 문자열의 작은따옴표는 두 배로 이스케이프된다", () => {
    const sql = buildMultiValuesInsert("t", ["a", "b", "c"], [["O'Brien", null, undefined as unknown as null]]);
    expect(sql).toContain("'O''Brien'");
    expect(sql).toContain("NULL, NULL");
  });

  test("NaN/Infinity 숫자는 NULL로 대체된다(유효하지 않은 SQL 리터럴 방지)", () => {
    const sql = buildMultiValuesInsert("t", ["a"], [[NaN], [Infinity], [-Infinity]]);
    // 3행 모두 NULL이어야 한다.
    expect(sql.match(/\(NULL\)/g)).toHaveLength(3);
  });

  test("conflictClause를 커스터마이즈할 수 있다", () => {
    const sql = buildMultiValuesInsert("t", ["a"], [[1]], { conflictClause: "ON CONFLICT (a) DO UPDATE SET a=a" });
    expect(sql.endsWith("ON CONFLICT (a) DO UPDATE SET a=a;")).toBe(true);
  });

  test("행이 0개면 빈 문자열을 반환한다", () => {
    expect(buildMultiValuesInsert("t", ["a"], [])).toBe("");
  });

  test("바이트 예산을 넘으면 여러 INSERT 문으로 나뉜다(행 개수가 아니라 바이트 기준)", () => {
    // 컬럼 1개, 값은 1000바이트짜리 문자열 — maxStatementBytes를 작게 잡아 청킹을 강제한다.
    const bigValue = "x".repeat(1000);
    const rows = Array.from({ length: 10 }, () => [bigValue]);
    const sql = buildMultiValuesInsert("t", ["a"], rows, { maxStatementBytes: 3000 });

    const statements = sql.split("\n\n");
    expect(statements.length).toBeGreaterThan(1);
    // 각 statement가 실제로 바이트 한도를 넘지 않는지 확인(안전마진 포함 로직이므로
    // "넘지 않는다"만 검증 — 정확한 개수는 구현 세부라 단언하지 않는다).
    for (const stmt of statements) {
      expect(Buffer.byteLength(stmt, "utf8")).toBeLessThanOrEqual(3000);
    }
    // 모든 행이 어딘가에는 포함돼야 한다(유실 없음).
    const totalRowsInOutput = statements.reduce((sum, s) => sum + (s.match(/\('x+/g)?.length ?? 0), 0);
    expect(totalRowsInOutput).toBe(10);
  });

  test("행 1개가 예산을 통째로 넘는 극단적 케이스도 유실 없이 그 행만 별도 statement로 담는다", () => {
    const hugeValue = "y".repeat(5000);
    const sql = buildMultiValuesInsert("t", ["a"], [["small"], [hugeValue], ["small2"]], {
      maxStatementBytes: 200,
    });
    expect(sql).toContain("'small'");
    expect(sql).toContain(`'${hugeValue}'`);
    expect(sql).toContain("'small2'");
  });

  test("기본 maxStatementBytes(80,000)는 D1의 100,000바이트 한도 아래로 안전마진을 둔다", () => {
    const rows = Array.from({ length: 2000 }, (_, i) => [`KR${String(i).padStart(10, "0")}`, i]);
    const sql = buildMultiValuesInsert("bond", ["isin_cd", "bond_bal"], rows);
    for (const stmt of sql.split("\n\n")) {
      expect(Buffer.byteLength(stmt, "utf8")).toBeLessThan(100_000);
    }
  });
});
