import { describe, expect, test } from "vitest";
import { BOND_COLUMNS, BOND_PRICE_COLUMNS, BOND_STATE_COLUMNS } from "@/lib/bond/columns";
import { BOND_PRICE_INSERT_SQL, BOND_STATE_INSERT_SQL, BOND_UPSERT_SQL } from "@/lib/d1/sql";

function countJsonExtract(sql: string): number {
  return (sql.match(/json_extract/g) ?? []).length;
}

describe("BOND_UPSERT_SQL", () => {
  test("json_extract 개수가 BOND_COLUMNS 길이와 같다", () => {
    expect(countJsonExtract(BOND_UPSERT_SQL)).toBe(BOND_COLUMNS.length);
  });

  test("conflict 절에 first_seen_bas_dt/srtn_cd/itms_nm이 없다 (최초값·시세충전값 보존)", () => {
    const conflictClause = BOND_UPSERT_SQL.split("DO UPDATE SET")[1];
    expect(conflictClause).not.toMatch(/first_seen_bas_dt = excluded/);
    expect(conflictClause).not.toMatch(/srtn_cd = excluded/);
    expect(conflictClause).not.toMatch(/itms_nm = excluded/);
  });

  test("isin_cd 충돌 대상으로 잡혀 있다", () => {
    expect(BOND_UPSERT_SQL).toContain("ON CONFLICT(isin_cd)");
  });
});

describe("BOND_STATE_INSERT_SQL", () => {
  test("json_extract 개수가 BOND_STATE_COLUMNS 길이와 같다", () => {
    expect(countJsonExtract(BOND_STATE_INSERT_SQL)).toBe(BOND_STATE_COLUMNS.length);
  });

  test("(isin_cd, valid_from) 충돌 시 DO NOTHING", () => {
    expect(BOND_STATE_INSERT_SQL).toContain("ON CONFLICT(isin_cd, valid_from) DO NOTHING");
  });
});

describe("BOND_PRICE_INSERT_SQL", () => {
  test("json_extract 개수가 BOND_PRICE_COLUMNS 길이와 같다", () => {
    expect(countJsonExtract(BOND_PRICE_INSERT_SQL)).toBe(BOND_PRICE_COLUMNS.length);
  });

  test("(isin_cd, bas_dt, mrkt_ctg) 충돌 시 DO NOTHING (idempotent 재실행의 근거)", () => {
    expect(BOND_PRICE_INSERT_SQL).toContain("ON CONFLICT(isin_cd, bas_dt, mrkt_ctg) DO NOTHING");
  });
});
