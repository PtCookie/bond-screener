import { describe, expect, test } from "vitest";
import { buildBondSearchQuery, type BondSearchFilters } from "@/lib/d1/sql";

describe("buildBondSearchQuery", () => {
  test("필터가 없으면 WHERE 절 없이 정렬·limit만 붙는다", () => {
    const { sql, binds } = buildBondSearchQuery({ limit: 20 });
    expect(sql).not.toContain("WHERE");
    expect(sql).toContain("ORDER BY b.bond_expr_dt ASC NULLS LAST");
    expect(binds).toEqual([20]);
  });

  test("issuer/name은 LIKE 부분일치로 바인딩된다(%로 감쌈)", () => {
    const { sql, binds } = buildBondSearchQuery({ issuer: "한국전력", name: "국고채", limit: 10 });
    expect(sql).toContain("b.bond_isur_nm LIKE ?");
    expect(sql).toContain("b.isin_cd_nm LIKE ?");
    expect(binds).toEqual(["%한국전력%", "%국고채%", 10]);
  });

  test("만기·표면이율 범위 필터가 각각 >=/<= 로 바인딩된다", () => {
    const filters: BondSearchFilters = { exprFrom: 20260101, exprTo: 20301231, couponMin: 1, couponMax: 5, limit: 10 };
    const { sql, binds } = buildBondSearchQuery(filters);
    expect(sql).toContain("b.bond_expr_dt >= ?");
    expect(sql).toContain("b.bond_expr_dt <= ?");
    expect(sql).toContain("b.bond_srfc_inrt >= ?");
    expect(sql).toContain("b.bond_srfc_inrt <= ?");
    expect(binds).toEqual([20260101, 20301231, 1, 5, 10]);
  });

  test("grade 배열은 개수만큼 플레이스홀더가 있는 IN 절이 된다", () => {
    const { sql, binds } = buildBondSearchQuery({ grade: ["AAA", "AA+", "AA"], limit: 5 });
    expect(sql).toContain("s.kis_grade IN (?, ?, ?)");
    expect(binds).toEqual(["AAA", "AA+", "AA", 5]);
  });

  test("빈 grade 배열은 필터를 만들지 않는다", () => {
    const { sql, binds } = buildBondSearchQuery({ grade: [], limit: 5 });
    expect(sql).not.toContain("kis_grade IN");
    expect(sql).not.toContain("WHERE");
    expect(binds).toEqual([5]);
  });

  test("balMin은 bond_state.bond_bal 하한으로 바인딩된다", () => {
    const { sql, binds } = buildBondSearchQuery({ balMin: 1_000_000, limit: 5 });
    expect(sql).toContain("s.bond_bal >= ?");
    expect(binds).toEqual([1_000_000, 5]);
  });

  test.each([
    ["bondBal", "s.bond_bal DESC NULLS LAST"],
    ["coupon", "b.bond_srfc_inrt DESC NULLS LAST"],
  ] as const)("sort=%s는 해당 ORDER BY 절을 쓴다", (sort, expectedOrder) => {
    const { sql } = buildBondSearchQuery({ sort, limit: 5 });
    expect(sql).toContain(`ORDER BY ${expectedOrder}`);
  });

  test("여러 필터를 조합해도 binds 순서가 WHERE 절 등장 순서 → limit 순으로 일치한다", () => {
    const { sql, binds } = buildBondSearchQuery({
      issuer: "발행사",
      exprFrom: 20260101,
      grade: ["AA+"],
      balMin: 500,
      limit: 30,
    });
    const placeholderCount = (sql.match(/\?/g) ?? []).length;
    expect(placeholderCount).toBe(binds.length);
    expect(binds).toEqual(["%발행사%", 20260101, "AA+", 500, 30]);
  });
});
